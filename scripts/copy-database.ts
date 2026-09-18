/**
 * Copies every table of the database varlock resolves (the source) into
 * another database given explicitly (the target): the production move to
 * Turso's newer platform (docs/environments.md), or any whole-database
 * clone. Files in Blob are not touched: both databases point at the same
 * stores, so URLs stay valid.
 *
 *   TARGET_DATABASE_URL=… TARGET_AUTH_TOKEN=… bun run db:copy-database
 *   … -- --wipe           # drop the target's tables first (CONFIRM=yes required)
 *   … -- --verify         # after copying, compare row counts per table
 *
 * Not for copying between stages: their files live in different stores, so
 * the copied URLs would point at the wrong one (use snapshot-accounts.ts and
 * restore-accounts.ts for that). The target must be empty unless --wipe is given. Tables are copied in
 * name order with foreign keys off, including __drizzle_migrations, so the
 * migrator's state travels too. Rows are inserted in batches of 200.
 */
import { createClient, type InValue, type Row } from "@libsql/client";
import { libsqlUrl } from "../src/lib/utils/libsqlUrl";

const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, TARGET_DATABASE_URL, TARGET_AUTH_TOKEN } =
	process.env;
if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) throw new Error("run via `varlock run`");
if (!TARGET_DATABASE_URL || !TARGET_AUTH_TOKEN) {
	throw new Error("TARGET_DATABASE_URL and TARGET_AUTH_TOKEN name the database to copy into");
}
if (libsqlUrl(TARGET_DATABASE_URL) === libsqlUrl(TURSO_DATABASE_URL)) {
	throw new Error("source and target are the same database");
}
const args = process.argv.slice(2);
const wipe = args.includes("--wipe");
const verify = args.includes("--verify");

const source = createClient({ url: libsqlUrl(TURSO_DATABASE_URL), authToken: TURSO_AUTH_TOKEN });
const target = createClient({ url: libsqlUrl(TARGET_DATABASE_URL), authToken: TARGET_AUTH_TOKEN });
const name = (u: string) => u.replace(/^\w+:\/\//, "").split(".")[0];
/** libsql types a cell as Value; names, SQL and counts are what these queries return. */
const text = (v: unknown) => (typeof v === "string" ? v : "");
const count = (v: unknown) => (typeof v === "number" ? v : typeof v === "bigint" ? Number(v) : -1);
console.log(`copy ${name(TURSO_DATABASE_URL)} → ${name(TARGET_DATABASE_URL)}`);

const USER_TABLES =
	"select name, sql from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '_litestream%' and name not like '\\_\\_turso%' escape '\\' order by name";
const tables = (await source.execute(USER_TABLES)).rows;
const existing = (await target.execute(USER_TABLES)).rows;
if (existing.length > 0) {
	if (!wipe)
		throw new Error(`target already has ${existing.length} tables; pass --wipe to replace them`);
	if (process.env.CONFIRM !== "yes") throw new Error("--wipe needs CONFIRM=yes in the environment");
	await target.execute("pragma foreign_keys = off");
	for (const t of existing) await target.execute(`drop table if exists "${text(t.name)}"`);
	console.log(`wiped ${existing.length} tables on the target`);
}

// Schema first (tables, then indexes), exactly as the source has it.
await target.execute("pragma foreign_keys = off");
for (const t of tables) await target.execute(text(t.sql));
const indexes = (
	await source.execute(
		"select sql from sqlite_master where type = 'index' and sql is not null and tbl_name not like 'sqlite_%'",
	)
).rows;
for (const i of indexes) await target.execute(text(i.sql));
console.log(`schema: ${tables.length} tables, ${indexes.length} indexes`);

const BATCH = 200;
let total = 0;
for (const t of tables) {
	const table = text(t.name);
	const rows = (await source.execute(`select * from "${table}"`)).rows;
	for (let i = 0; i < rows.length; i += BATCH) {
		const chunk = rows.slice(i, i + BATCH);
		await target.batch(
			chunk.map((row: Row) => {
				const cols = Object.keys(row);
				return {
					sql: `insert into "${table}" (${cols.map((c) => `"${c}"`).join(",")}) values (${cols.map(() => "?").join(",")})`,
					args: cols.map((c) => row[c] as InValue),
				};
			}),
			"write",
		);
	}
	total += rows.length;
	console.log(`${table}: ${rows.length} rows`);
}
await target.execute("pragma foreign_keys = on");
console.log(`copied ${total} rows in ${tables.length} tables`);

if (verify) {
	let mismatches = 0;
	for (const t of tables) {
		const table = text(t.name);
		const [a, b] = await Promise.all([
			source.execute(`select count(*) as n from "${table}"`),
			target.execute(`select count(*) as n from "${table}"`),
		]);
		const [na, nb] = [count(a.rows[0].n), count(b.rows[0].n)];
		if (na !== nb) {
			mismatches++;
			console.log(`MISMATCH ${table}: source ${na}, target ${nb}`);
		}
	}
	console.log(
		mismatches ? `${mismatches} tables differ` : "verified: every table has the same row count",
	);
	if (mismatches) process.exit(1);
}
