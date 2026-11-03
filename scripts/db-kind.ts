/**
 * Which kind of Turso database a stage runs, and whether it enforces
 * foreign keys (FINDINGS.md "Study AW"; docs/environment.md):
 *
 *   bun run db:kind                 # the stage varlock resolves (dev here; production from Kevin's machine)
 *   APP_ENV=preview bun run db:kind # staging
 *
 * Read-only. The engine kind (TursoDB/MVCC) carries the
 * `__turso_internal_mvcc_meta` table and does not enforce foreign keys,
 * so `src/lib/server/cascade.ts` is load-bearing there; the classic
 * libsql kind enforces them always. Either way the answer is read from
 * the database, not assumed.
 */
import { createClient } from "@libsql/client";
import { libsqlUrl } from "../src/lib/utils/libsqlUrl";

const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } = process.env;
if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN)
	throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are not set (run via `varlock run`)");

const url = libsqlUrl(TURSO_DATABASE_URL);
const client = createClient({ url, authToken: TURSO_AUTH_TOKEN });
const host = new URL(url.replace(/^libsql:/, "https:")).host;
const marker = await client.execute(
	"SELECT count(*) AS n FROM sqlite_master WHERE name = '__turso_internal_mvcc_meta'",
);
const pragma = await client.execute("PRAGMA foreign_keys");
const engine = Number(marker.rows[0]?.n) === 1;
const foreignKeys = Number(Object.values(pragma.rows[0] ?? {})[0]);
console.log(
	`${host}: ${engine ? "engine (TursoDB/MVCC)" : "classic (libsql)"} kind, PRAGMA foreign_keys = ${foreignKeys}`,
);
console.log(
	engine
		? "Foreign keys are not enforced: cascade.ts removes every child itself (load-bearing)."
		: "Foreign keys are enforced by the database; cascade.ts is redundant but harmless.",
);
