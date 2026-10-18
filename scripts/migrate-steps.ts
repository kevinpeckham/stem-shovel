/**
 * drizzle-kit's migrate, one statement at a time (docs/environment.md,
 * "Migrations"): Turso has answered HTTP 502 to the batch drizzle-kit sends
 * for a migration while taking the same statements singly (migrations 0089
 * and 0090, 2026-10-18). This reads the same migration files, skips those
 * the journal table already holds, runs each pending file's statements in
 * order, and writes the journal row drizzle-kit would (its hash and
 * folder time), so `bun run db:status` and the next `db:migrate` agree.
 * Not a transaction: a failure part way says which statement, and the
 * rest is applied by hand or by running this again after fixing it.
 *
 *   bun run db:migrate:steps            (APP_ENV=preview for staging)
 */
import { createClient } from "@libsql/client";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { libsqlUrl } from "../src/lib/utils/libsqlUrl";

const client = createClient({
	url: libsqlUrl(process.env.TURSO_DATABASE_URL!),
	authToken: process.env.TURSO_AUTH_TOKEN!,
});
const files = readMigrationFiles({ migrationsFolder: "drizzle" });
await client.execute(
	"CREATE TABLE IF NOT EXISTS `__drizzle_migrations` (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)",
);
const last = await client.execute(
	"SELECT created_at FROM `__drizzle_migrations` ORDER BY created_at DESC LIMIT 1",
);
const lastAt = Number(last.rows[0]?.created_at ?? 0);
let applied = 0;
for (const m of files) {
	if (m.folderMillis <= lastAt) continue;
	console.log(`applying ${m.folderMillis} (${m.sql.length} statements)`);
	for (const [i, stmt] of m.sql.entries()) {
		try {
			await client.execute(stmt);
		} catch (e) {
			console.error(
				`failed at statement ${i + 1} of ${m.sql.length}:\n${stmt}\n${e instanceof Error ? e.message : String(e)}`,
			);
			process.exit(1);
		}
	}
	await client.execute({
		sql: "INSERT INTO `__drizzle_migrations` (hash, created_at) VALUES (?, ?)",
		args: [m.hash, m.folderMillis],
	});
	applied++;
}
console.log(applied ? `${applied} applied` : "nothing pending");
