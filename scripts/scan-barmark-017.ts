/**
 * Which stored charts and score reads use a construct whose meaning changed
 * in barmark 0.17.0 (a `---` line is a break, a leading `\` is hidden,
 * `lyrics:` rows, a part's bare line sharing a system with its named lines).
 * Read-only; run per stage (`APP_ENV=preview` for staging, production from
 * Kevin's machine). Delete once every stage has been scanned.
 */
import { db } from "#lib/server/db/index.js";
import { song } from "#lib/server/db/schema/song.js";
import { songFile } from "#lib/server/db/schema/songFile.js";
import { isNotNull } from "drizzle-orm";

const CHANGED: [string, RegExp][] = [
	["---", /^\s*-{3,}\s*$/m],
	["leading-backslash", /^\\/m],
	["lyrics-row", /^lyrics(\s+\d+)?:.*\|/m],
	["part-lines", /^\s*[A-Za-z]+\.[A-Za-z]+\s*\|/m],
];
const flags = (text: string | null) =>
	text ? CHANGED.filter(([, re]) => re.test(text)).map(([name]) => name) : [];
/** The lines a changed construct matched, so the chart's author can judge them. */
const lines = (text: string | null) =>
	(text ?? "")
		.split("\n")
		.filter((line) => CHANGED.some(([, re]) => re.test(line)))
		.map((line) => `    ${line.slice(0, 100)}`);

const charts = await db.select({ slug: song.slug, text: song.chartMarkdown }).from(song);
const reads = await db
	.select({ id: songFile.id, text: songFile.chartRead })
	.from(songFile)
	.where(isNotNull(songFile.chartRead));
const found = [
	...charts.map((c) => ["chart", c.slug, flags(c.text)] as const),
	...reads.map((r) => ["read", r.id, flags(r.text)] as const),
].filter(([, , f]) => f.length);
for (const [kind, name, f] of found) {
	console.log(kind, name, f.join(","));
	const text =
		kind === "chart"
			? charts.find((c) => c.slug === name)?.text
			: reads.find((r) => r.id === name)?.text;
	for (const line of lines(text ?? null)) console.log(line);
}
console.log(
	`${charts.length} charts, ${reads.length} score reads, ${found.length} with a changed construct`,
);
process.exit(0);
