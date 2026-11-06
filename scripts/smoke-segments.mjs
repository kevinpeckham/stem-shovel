/**
 * Print the dynamic routes' sample values as the JSON `SMOKE_SEGMENTS`
 * takes: `bun run smoke:segments` reads the stage's database (the one the
 * environment names; APP_ENV=preview for staging) and prints one line to
 * set as the repository variable the nightly smoke test runs with
 * (docs/security.md "Nightly, from GitHub"):
 *
 *   bun run smoke:segments | gh variable set SMOKE_SEGMENTS
 *
 * The values are public slugs and one song id, nothing secret.
 */
import { loadSegments } from "./lib/siteRoutes.mjs";

const s = await loadSegments();
if (!s.acct) {
	console.error("No database in the environment: nothing to print.");
	process.exit(2);
}
console.log(JSON.stringify(s));
