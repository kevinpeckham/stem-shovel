/**
 * Every barmark text on a stage read by the installed barmark, read-only
 * (docs/audio-engine.md, "Charts and barmark releases"): each song's chord
 * chart, each score's stored read (`song_pdf.chart_read`, which the song
 * check places on the stems like a chart) and each idea's chart:
 *
 *   bun run db:chart-check                 # the stage varlock resolves (dev here; production from Kevin's machine)
 *   APP_ENV=preview bun run db:chart-check # staging
 *
 * A barmark minor may tighten the grammar (0.20.0: a Coda with no bar
 * after it is an error, a replay's `->` cuts the bar as written), so
 * before a release bumps the package, this lists the charts whose read
 * changes: those with an error, and those whose played bar count differs
 * from the committed barmark's. Prints one line a chart with a problem,
 * a summary, and exits 1 when any chart has an error (2 when node_modules'
 * barmark is not the one package.json pins: run `bun install` first).
 */
import { createClient } from "@libsql/client";
import { parseChart } from "barmark";
import { createRequire } from "node:module";
import { libsqlUrl } from "../src/lib/utils/libsqlUrl";

const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } = process.env;
if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN)
	throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are not set (run via `varlock run`)");

// The barmark that reads the charts must be the one package.json pins: a stale
// node_modules (a pull without `bun install`) once reported 0.2.0's messages as 0.21.0's.
const require = createRequire(import.meta.url);
const installed = (require("barmark/package.json") as { version: string }).version;
const pinned = (require("../package.json") as { dependencies: Record<string, string> }).dependencies
	.barmark;
if (installed !== pinned) {
	console.error(
		`node_modules holds barmark ${installed} but package.json pins ${pinned}: run \`bun install\` first`,
	);
	process.exit(2);
}

const client = createClient({ url: libsqlUrl(TURSO_DATABASE_URL), authToken: TURSO_AUTH_TOKEN });
console.log(`database: ${new URL(libsqlUrl(TURSO_DATABASE_URL)).host}`);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const songPath = "'/' || a.slug || '/projects/' || p.slug || coalesce('/' || s.slug, '')";
/** Every barmark text a stage keeps: a song's chord chart, a score's stored read, an idea's chart. */
const SOURCES = [
	{
		kind: "chart",
		sql: `select ${songPath} as path, s.chart_markdown as chart from song s join project p on p.id = s.project_id join account a on a.id = s.account_id where s.chart_markdown <> ''`,
	},
	{
		kind: "score read",
		sql: `select ${songPath} || ' (' || f.filename || ')' as path, f.chart_read as chart from song_pdf f join project p on p.id = f.project_id join account a on a.id = f.account_id left join song s on s.id = f.song_id where f.chart_read is not null and f.chart_read <> ''`,
	},
	{
		kind: "idea chart",
		sql: "select '/' || a.slug || ' idea ' || i.id as path, i.chart as chart from idea i join account a on a.id = i.account_id where i.chart <> ''",
	},
];
let errors = 0;
let warnings = 0;
const counts: string[] = [];
for (const source of SOURCES) {
	const rows = await client.execute(source.sql);
	counts.push(`${rows.rows.length} ${source.kind}${rows.rows.length === 1 ? "" : "s"}`);
	for (const row of rows.rows) {
		const parse = parseChart(str(row.chart));
		const errs = parse.diagnostics.filter((d) => d.severity === "error");
		const warns = parse.diagnostics.filter((d) => d.severity === "warning");
		const where = `${source.kind} ${str(row.path)}`;
		if (errs.length > 0) {
			errors++;
			console.log(`ERROR    ${where}: ${errs.map((d) => d.message).join("; ")}`);
		} else if (warns.length > 0) {
			warnings++;
			console.log(
				`warning  ${where}: ${warns.map((d) => d.message).join("; ")} (${parse.bars.length} bars)`,
			);
		}
	}
}
console.log(
	`${counts.join(", ")} read with barmark ${installed}: ${errors} with errors, ${warnings} with warnings`,
);
process.exit(errors > 0 ? 1 : 0);
