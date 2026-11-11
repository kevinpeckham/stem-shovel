import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";

/**
 * Guard for docs/arrangements.md, "Every read says which stems it wants": a
 * read of the `stem` table, or a song's `stems` relation, must either take
 * `mainStems` (the song's stems mean Main) or `stemsOf(…)` (one named
 * arrangement's, Main's when null), or carry the `// every arrangement:`
 * marker (housekeeping over every row). A read by one stem's id needs neither.
 */
const MARKER = "// every arrangement:";
const FILES = ["data.ts", "access.ts", "relocate.ts", "projectLifecycle.ts", "cascade.ts"];
/** Most lines a statement may run, either way from the match, before the guard stops looking. */
const SPAN = 25;
/** The first line of a statement: a declaration, an `await`, a `return`, or a bare `db…` call. */
const STARTS = /^\s*(const|let|await|return|db\b)/;

/** The text from `open` (an index of `{`) to its matching `}`. */
function block(src: string, open: number): string {
	let depth = 0;
	for (let i = open; i < src.length; i++) {
		if (src[i] === "{") depth++;
		else if (src[i] === "}" && --depth === 0) return src.slice(open, i + 1);
	}
	return src.slice(open);
}

/** The comment lines directly above line `at` (0-based), where a read's marker sits. */
function commentsAbove(lines: string[], at: number): string {
	let top = at;
	while (top > 0 && lines[top - 1].trimStart().startsWith("//")) top--;
	return lines.slice(top, at).join("\n");
}

/** The statement holding line `at` (0-based), from its first line to the first line ending in `;`, with the comments above it. */
function statement(lines: string[], at: number): string {
	let start = at;
	while (start > 0 && at - start < SPAN && !STARTS.test(lines[start])) start--;
	let end = at;
	while (end < lines.length - 1 && end - at < SPAN && !lines[end].trimEnd().endsWith(";")) end++;
	return [commentsAbove(lines, start), ...lines.slice(start, end + 1)].join("\n");
}

const marked = (text: string) =>
	text.includes("mainStems") || text.includes("stemsOf(") || text.includes(MARKER);
const lineOf = (src: string, index: number) => src.slice(0, index).split("\n").length;

/**
 * Whether a `stems: {` or `stems: true` at `index` is an unmarked read of a
 * song's (or an arrangement's) `stems` relation: a `with` option holding
 * `columns`, `where` or `orderBy` (a type annotation holds none of them), not
 * a take's `recordingStem` rows, with neither marker in it or above it.
 */
function unmarkedRelation(src: string, lines: string[], index: number): boolean {
	const lead = commentsAbove(lines, lineOf(src, index) - 1);
	const options = src.startsWith("stems: true", index) ? "" : block(src, index + "stems: ".length);
	if (options && !/\b(columns|where|orderBy):/.test(options)) return false;
	if (options.includes("recordingStem")) return false;
	return !marked(options) && !marked(lead);
}

/** Whether a `.from(stem)` or `query.stem.findMany(` on line `at` (1-based) is an unmarked read that is not by one stem's id. */
function unmarkedSelect(lines: string[], at: number): boolean {
	const text = statement(lines, at - 1);
	return !text.includes("eq(stem.id,") && !marked(text);
}

/** Line numbers (1-based) of stem reads in `src` that say neither Main nor every arrangement. */
function unmarkedStemReads(src: string): number[] {
	const lines = src.split("\n");
	const relations = [...src.matchAll(/\bstems: (\{|true\b)/g)]
		.filter((m) => unmarkedRelation(src, lines, m.index))
		.map((m) => lineOf(src, m.index));
	const selects = [...src.matchAll(/\.from\(stem\)|\bquery\.stem\.findMany\(/g)]
		.map((m) => lineOf(src, m.index))
		.filter((at) => unmarkedSelect(lines, at));
	return [...relations, ...selects].sort((x, y) => x - y);
}

describe("unmarkedStemReads", () => {
	test("flags a song's stems read without the Main condition or the marker, and passes the others", () => {
		const src = [
			"const a = await db.query.song.findFirst({",
			"\twith: { stems: { orderBy: [asc(stem.sortOrder)] } },",
			"});",
			"const b = await db.query.song.findFirst({",
			"\twith: { stems: { where: mainStems, columns: { id: true } } },",
			"});",
			"const c = await db.query.stem.findMany({",
			"\twhere: eq(stem.songId, songId),",
			"});",
			"// every arrangement: storage.",
			"const d = await db",
			"\t.select({ n: sql`count(*)` })",
			"\t.from(stem)",
			"\t.where(eq(stem.accountId, accountId));",
			"const e = await db.select().from(stem).where(eq(stem.id, id));",
			"function f(s: { stems: { id: string }[] }) {}",
			"const g = await db.query.recording.findFirst({",
			"\twith: { stems: { where: eq(recordingStem.status, 'ready') } },",
			"});",
			"const h = await db.query.song.findMany({ with: { stems: true } });",
			"const i = await db.query.stem.findMany({",
			"\twhere: and(eq(stem.songId, songId), stemsOf(arrangementId)),",
			"});",
			"const j = await db.query.song.findFirst({",
			"\twith: { stems: { where: stemsOf(null), columns: { id: true } } },",
			"});",
		].join("\n");
		expect(unmarkedStemReads(src)).toEqual([2, 7, 20]);
	});
});

describe("stem reads in src/lib/server", () => {
	test.each(FILES)("%s: every read of a song's stems says Main or every arrangement", (file) => {
		const src = readFileSync(join(import.meta.dirname, file), "utf8");
		expect(unmarkedStemReads(src)).toEqual([]);
	});
});
