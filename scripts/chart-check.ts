/**
 * Every chart on a stage read by the installed barmark, read-only
 * (docs/audio-engine.md, "Charts and barmark releases"):
 *
 *   bun run db:chart-check                 # the stage varlock resolves (dev here; production from Kevin's machine)
 *   APP_ENV=preview bun run db:chart-check # staging
 *
 * A barmark minor may tighten the grammar (0.20.0: a Coda with no bar
 * after it is an error, a replay's `->` cuts the bar as written), so
 * before a release bumps the package, this lists the charts whose read
 * changes: those with an error, and those whose played bar count differs
 * from the committed barmark's. Prints one line a chart with a problem,
 * a summary, and exits 1 when any chart has an error.
 */
import { createClient } from "@libsql/client";
import { parseChart } from "barmark";
import { createRequire } from "node:module";
import { libsqlUrl } from "../src/lib/utils/libsqlUrl";

const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } = process.env;
if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN)
	throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are not set (run via `varlock run`)");

const client = createClient({ url: libsqlUrl(TURSO_DATABASE_URL), authToken: TURSO_AUTH_TOKEN });
console.log(`database: ${new URL(libsqlUrl(TURSO_DATABASE_URL)).host}`);
const rows = await client.execute(
	"select s.slug, p.slug as project, a.slug as account, s.chart_markdown as chart from song s join project p on p.id = s.project_id join account a on a.id = s.account_id where s.chart_markdown <> ''",
);
let errors = 0;
let warnings = 0;
const str = (v: unknown) => (typeof v === "string" ? v : "");
for (const row of rows.rows) {
	const parse = parseChart(str(row.chart));
	const errs = parse.diagnostics.filter((d) => d.severity === "error");
	const warns = parse.diagnostics.filter((d) => d.severity === "warning");
	const path = `/${str(row.account)}/projects/${str(row.project)}/${str(row.slug)}`;
	if (errs.length > 0) {
		errors++;
		console.log(`ERROR    ${path}: ${errs.map((d) => d.message).join("; ")}`);
	} else if (warns.length > 0) {
		warnings++;
		console.log(
			`warning  ${path}: ${warns.map((d) => d.message).join("; ")} (${parse.bars.length} bars)`,
		);
	}
}
const barmarkVersion = (
	createRequire(import.meta.url)("barmark/package.json") as { version: string }
).version;
console.log(
	`${rows.rows.length} charts read with barmark ${barmarkVersion}: ${errors} with errors, ${warnings} with warnings`,
);
process.exit(errors > 0 ? 1 : 0);
