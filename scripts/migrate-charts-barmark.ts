/**
 * Converts every stored chord chart of a stage from the band's old idiom
 * to barmark (docs/barmark-adoption-plan.md, Scope 2) with
 * `legacyChartToBarmark`, which refuses rather than guesses. A dry run by
 * default: each song's result goes to scripts/chart-migration/ as
 * `<account>--<song>.md` (the converted chart) or `<account>--<song>.refused.txt`
 * (the reasons and the attempt), and a summary table prints the bars the
 * old parser reads (`chordChartBars`, with the song's own tempo and meter)
 * beside the bars barmark reads of the conversion.
 *
 *   bunx varlock run -- bun scripts/migrate-charts-barmark.ts                     # dry run
 *   bunx varlock run -- bun scripts/migrate-charts-barmark.ts \
 *     --apply <account-slug>/<song-slug> --as <email>                             # replace one chart
 *   APP_ENV=preview bunx varlock run -- bun scripts/migrate-charts-barmark.ts     # staging
 *
 * --apply replaces that one song's chart through `saveSongDoc`, the app's
 * own chart save, so the document history keeps the old text as a version
 * (restorable from the song's History); `--as` names the user the version
 * is recorded under. It refuses a chart the converter refused. Kevin
 * confirms each converted chart in the app before it is applied.
 *
 * Run against the stage whose database the environment resolves: on a
 * machine without that stage's secrets, varlock falls back to another
 * stage's without a word (FINDINGS.md 2026-10-26), so the host is printed
 * first.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@libsql/client";
import { parseChart } from "barmark";
import { chartDefaults } from "../src/lib/utils/chartDefaults";
import { chordChartBars } from "../src/lib/utils/chordChartBars";
import { legacyChartToBarmark } from "../src/lib/utils/legacyChartToBarmark";
import { libsqlUrl } from "../src/lib/utils/libsqlUrl";

const args = process.argv.slice(2);
const flag = (name: string) => {
	const i = args.indexOf(name);
	return i < 0 ? null : (args[i + 1] ?? "");
};
const applyTo = flag("--apply");
const asEmail = flag("--as");

const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } = process.env;
if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN)
	throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are needed");
console.log(`database: ${new URL(TURSO_DATABASE_URL.replace(/^libsql:/, "https:")).hostname}`);
const db = createClient({ url: libsqlUrl(TURSO_DATABASE_URL), authToken: TURSO_AUTH_TOKEN });

interface Row {
	id: string;
	account_id: string;
	account: string;
	project: string;
	slug: string;
	title: string;
	chart_markdown: string;
	changes: string;
}
const rows = (
	await db.execute(
		`select s.id, s.account_id, a.slug as account, p.slug as project, s.slug, s.title, s.chart_markdown, s.changes
		 from song s
		 join account a on a.id = s.account_id
		 join project p on p.id = s.project_id
		 where trim(s.chart_markdown) != ''
		 order by a.slug, p.slug, s.slug`,
	)
).rows as unknown as Row[];
if (rows.length === 0) {
	console.log("No song has a chart.");
	process.exit(0);
}

const outDir = new URL("./chart-migration/", import.meta.url);
mkdirSync(outDir, { recursive: true });

/** `<account>--<song>`, with the project when two projects of an account share a song slug. */
const fileBase = (r: Row) => {
	const twins = rows.filter((x) => x.account === r.account && x.slug === r.slug).length > 1;
	return twins ? `${r.account}--${r.project}--${r.slug}` : `${r.account}--${r.slug}`;
};

const parseChanges = (json: string) => {
	try {
		return JSON.parse(json) as { kind: string; start: number; value: string }[];
	} catch {
		return [];
	}
};

const results = rows.map((r) => {
	const result = legacyChartToBarmark(r.chart_markdown);
	const before = chordChartBars(r.chart_markdown, chartDefaults(parseChanges(r.changes)));
	const after = result.text ? parseChart(result.text).bars.length : null;
	const base = fileBase(r);
	if (result.ok) {
		writeFileSync(new URL(`${base}.md`, outDir), result.text);
	} else {
		const attempt = result.text ?? "(none)";
		writeFileSync(
			new URL(`${base}.refused.txt`, outDir),
			`Refused: ${r.title} (/${r.account}/projects/${r.project}/${r.slug})\n\n${result.reasons.map((x) => `- ${x}`).join("\n")}\n\n--- the attempt ---\n${attempt}`,
		);
	}
	return { row: r, result, before: before?.bars.length ?? 0, after };
});

const table = results.map(({ row, result, before, after }) => ({
	song: `${row.account}/${row.slug}`,
	outcome: result.ok ? "converted" : "REFUSED",
	before,
	after: result.ok ? after : "-",
	reasons: result.ok ? "" : result.reasons.join(" | "),
}));
const width = (k: keyof (typeof table)[number]) =>
	Math.max(k.length, ...table.map((t) => String(t[k]).length));
const cols = ["song", "outcome", "before", "after"] as const;
const header = [...cols.map((k) => k.padEnd(width(k))), "reasons"].join("  ");
console.log(`\n${header}\n${"-".repeat(header.length)}`);
for (const t of table)
	console.log([...cols.map((k) => String(t[k]).padEnd(width(k))), t.reasons].join("  "));
const done = results.filter((r) => r.result.ok).length;
console.log(
	`\n${done} converted, ${results.length - done} refused; files in scripts/chart-migration/.`,
);

if (applyTo === null) {
	console.log(
		"Dry run: nothing written to the database. --apply <account>/<song> --as <email> replaces one chart.",
	);
	process.exit(0);
}

const [account, songSlug] = applyTo.split("/");
const chosen = results.filter((x) => x.row.account === account && x.row.slug === songSlug);
if (chosen.length !== 1) {
	console.log(
		chosen.length === 0
			? `No chart for ${applyTo}.`
			: `${applyTo} names songs in ${chosen.length} projects; nothing applied.`,
	);
	process.exit(1);
}
const pick = chosen[0]!;
if (!pick.result.ok) {
	console.log(`The converter refused ${applyTo}; nothing applied. A human converts it.`);
	process.exit(1);
}
if (!asEmail) {
	console.log(
		"--as <email> names the user the old chart's version is recorded under; nothing applied.",
	);
	process.exit(1);
}
const users = (await db.execute({ sql: "select id from user where email = ?", args: [asEmail] }))
	.rows as unknown as { id: string }[];
if (users.length !== 1) {
	console.log(`No user ${asEmail} on this stage; nothing applied.`);
	process.exit(1);
}
// The app's chart save (hash-gated versions, the history kept); loaded only to apply.
const { saveSongDoc } = await import("../src/lib/server/data");
const saved = await saveSongDoc(
	pick.row.account_id,
	users[0]!.id,
	pick.row.id,
	"chart",
	pick.result.text,
);
if (!saved.ok) {
	console.log(`Not saved: ${saved.error}`);
	process.exit(1);
}
console.log(
	saved.changed
		? `Applied ${applyTo}: chart version ${saved.version}; the old text is the version before it in the song's History.`
		: `${applyTo} already holds this text; nothing changed.`,
);
process.exit(0);
