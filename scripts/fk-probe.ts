/**
 * The five-key foreign-key probe (docs/fk-coordinated-response-2026-11-03.md),
 * a change detector for the platform: one JSON line,
 * `{ date, defaultPragma, pragmaSticksAcrossClients, cascadeFired, violationRejected }`.
 *
 *   bun run db:fk-probe                 # the stage varlock resolves
 *   APP_ENV=preview bun run db:fk-probe # staging
 *
 * Informational: exits 0 whatever it reads. Creates two scratch tables
 * (`__fk_probe_<stamp>_parent`/`_child`) and drops them before it ends.
 */
import { createClient } from "@libsql/client";
import { fkProbe } from "../src/lib/utils/fkProbe";
import { libsqlUrl } from "../src/lib/utils/libsqlUrl";

const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } = process.env;
if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN)
	throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are not set (run via `varlock run`)");

const url = libsqlUrl(TURSO_DATABASE_URL);
const result = await fkProbe(() => createClient({ url, authToken: TURSO_AUTH_TOKEN }));
console.log(JSON.stringify(result));
