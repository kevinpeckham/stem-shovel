/**
 * Which migration the database is at (docs/environment.md):
 *
 *   bun run db:status                 # the stage varlock resolves (dev here; production from Kevin's machine)
 *   APP_ENV=preview bun run db:status # staging
 *
 * drizzle-kit records what it applied in `__drizzle_migrations` by the
 * journal's `when` timestamp; this names the last one applied and lists
 * any in drizzle/ still pending, so a release can check that production
 * has what the code expects before main is pushed.
 */
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
import { libsqlUrl } from "../src/lib/utils/libsqlUrl";

const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } = process.env;
if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN)
	throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are not set (run via `varlock run`)");

const journal = JSON.parse(
	readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"),
) as {
	entries: { idx: number; when: number; tag: string }[];
};
const client = createClient({ url: libsqlUrl(TURSO_DATABASE_URL), authToken: TURSO_AUTH_TOKEN });
const applied = new Set<number>();
try {
	const rows = await client.execute("select created_at from __drizzle_migrations");
	for (const r of rows.rows) applied.add(Number(r.created_at));
} catch {
	console.log("no __drizzle_migrations table: nothing applied yet");
	process.exit(1);
}
const entries = journal.entries.toSorted((a, b) => a.idx - b.idx);
const done = entries.filter((e) => applied.has(e.when));
const pending = entries.filter((e) => !applied.has(e.when));
const last = done.at(-1);
console.log(last ? `last applied: ${last.tag}` : "last applied: none");
if (pending.length) {
	console.log(`pending (${pending.length}): ${pending.map((e) => e.tag).join(", ")}`);
	process.exit(2);
}
console.log("pending: none");
