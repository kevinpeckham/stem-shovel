/**
 * Puts a snapshot (scripts/snapshot-accounts.ts) into the stage varlock
 * resolves: rows with their original ids, files uploaded to this stage's
 * Blob stores at their original pathnames, URL columns rewritten. Refuses
 * production. Run it on a migrated database, before the seed (the seed
 * finds the restored users by email and leaves them alone).
 *
 *   bun run db:restore-accounts <name>          # from .snapshots/<name>
 *
 * Rows already present (same id) are replaced, so it can be run again.
 * Two-factor enrolments are not restored: Better Auth encrypts each TOTP
 * secret with the stage's BETTER_AUTH_SECRET, so a copied row can never be
 * verified on another stage (the user gets "invalid code", then Better
 * Auth's 3-per-10-seconds limit on /two-factor/*). Users re-enrol per stage.
 */
import { createClient, type InValue } from "@libsql/client";
import { put } from "@vercel/blob";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { libsqlUrl } from "../src/lib/utils/libsqlUrl";

const {
	TURSO_DATABASE_URL,
	TURSO_AUTH_TOKEN,
	BLOB_READ_WRITE_TOKEN,
	BLOB_PRIVATE_READ_WRITE_TOKEN,
	APP_ENV,
} = process.env;
if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN || !BLOB_READ_WRITE_TOKEN)
	throw new Error("run via `varlock run`");
if (APP_ENV === "production") throw new Error("refusing to restore into production");
if (!/stem-shovel-(dev|stag(e|ing))/.test(TURSO_DATABASE_URL)) {
	throw new Error(`refusing: ${TURSO_DATABASE_URL} is not a dev or staging database`);
}
const [name] = process.argv.slice(2);
if (!name) throw new Error("usage: bun scripts/restore-accounts.ts <name>");
const dir = join(".snapshots", name);
const rows = JSON.parse(await readFile(join(dir, "rows.json"), "utf8")) as Record<
	string,
	Record<string, InValue>[]
>;
const files = JSON.parse(await readFile(join(dir, "files.json"), "utf8")) as {
	table: string;
	id: string;
	column: string;
	pathname: string;
	access: "public" | "private";
	bytes: number;
}[];
const clean = (t: string) => t.trim().replace(/^["']+|["']+$/g, "");

const c = createClient({ url: libsqlUrl(TURSO_DATABASE_URL), authToken: TURSO_AUTH_TOKEN });

// Rows first, files second: a row whose file has not arrived yet points at the
// source store for a moment, which is harmless on a stage being rebuilt.
await c.execute("pragma foreign_keys = off");
for (const [table, list] of Object.entries(rows)) {
	if (table === "two_factor") continue;
	for (const row of list) {
		if (table === "user" && "two_factor_enabled" in row) row.two_factor_enabled = 0;
		const cols = Object.keys(row);
		await c.execute({
			sql: `insert or replace into "${table}" (${cols.map((k) => `"${k}"`).join(",")}) values (${cols.map(() => "?").join(",")})`,
			args: cols.map((k) => row[k]),
		});
	}
	console.log(`${table}: ${list.length} rows`);
}
await c.execute("pragma foreign_keys = on");

// Private files stay private only when this stage has a private store.
const privateOk = !!BLOB_PRIVATE_READ_WRITE_TOKEN;
let done = 0;
for (const f of files) {
	const access = f.access === "private" && privateOk ? "private" : "public";
	const token = clean(
		access === "private" ? BLOB_PRIVATE_READ_WRITE_TOKEN! : BLOB_READ_WRITE_TOKEN,
	);
	const body = await readFile(join(dir, "files", f.pathname));
	const contentType = contentTypeOf(f.pathname);
	const blob = await put(f.pathname, body, {
		access,
		token,
		contentType,
		addRandomSuffix: false,
		allowOverwrite: true,
		cacheControlMaxAge: 60 * 60 * 24 * 30,
		multipart: body.byteLength > 20 * 1024 * 1024,
	});
	await c.execute({
		sql: `update "${f.table}" set "${f.column}" = ? where id = ?`,
		args: [blob.url, f.id],
	});
	done += f.bytes;
	console.log(`${(done / 1e6).toFixed(0).padStart(5)} MB  ${access.padEnd(7)} ${f.pathname}`);
}
console.log(`restored ${name} into ${APP_ENV ?? "development"}: ${files.length} files`);

function contentTypeOf(pathname: string) {
	const ext = pathname.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? "";
	return (
		{
			wav: "audio/wav",
			flac: "audio/flac",
			mp3: "audio/mpeg",
			m4a: "audio/mp4",
			mp4: "audio/mp4",
			aac: "audio/aac",
			ogg: "audio/ogg",
			webm: "audio/webm",
			aif: "audio/aiff",
			aiff: "audio/aiff",
			caf: "audio/x-caf",
			mid: "audio/midi",
			midi: "audio/midi",
		}[ext] ?? "application/octet-stream"
	);
}
