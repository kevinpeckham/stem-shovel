import { readFileSync } from "node:fs";
import { parseChart } from "barmark";
import type { ChartParse } from "barmark";
import { describe, expect, test } from "vite-plus/test";
import { legacyChartToBarmark } from "./legacyChartToBarmark.js";

/**
 * The band's five stored charts (the texts of chordChartBars.idiom.test.ts,
 * escapes as the in-app editor saved them) through the migration
 * (docs/barmark-adoption-plan.md, Scope 2): three convert, two are refused
 * for a human. The bench's verified bar list for Letter Lands
 * (stem-bench corpus/mmkk-charts.json) grades the conversion.
 */
const fixture = (name: string) =>
	readFileSync(new URL(`../../../tests/fixtures/charts/${name}`, import.meta.url), "utf8");

const converted = (slug: string) => {
	const result = legacyChartToBarmark(fixture(`legacy/${slug}.md`));
	if (!result.ok) throw new Error(`${slug} refused: ${result.reasons.join("; ")}`);
	const parse = parseChart(result.text);
	expect(parse.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
	return { result, parse };
};

const starts = (parse: ChartParse) => parse.sections.map((s) => `${s.name}@${s.firstBar}`);

/** A bar's chords as the bench spells them: parenthetical tones dropped, ASCII sharps. */
const benchChords = (parse: ChartParse) =>
	parse.bars.map((b) =>
		b.slots.flatMap((s) =>
			s.kind === "chord" ? [s.chord.canonical.replace(/\([^)]*\)/g, "").replace(/♯/g, "#")] : [],
		),
	);

const benchBars = (slug: string): string[][] => {
	const corpus = JSON.parse(fixture("bench-mmkk-charts.json")) as {
		songs: { slug: string; sections: { bars: string[][] }[] }[];
	};
	return corpus.songs.find((s) => s.slug === slug)!.sections.flatMap((s) => s.bars);
};

describe("legacyChartToBarmark on the band's stored charts", () => {
	test("Letter Lands converts: 76 bars in ten section occurrences where the band set them, the Structure as replays", () => {
		const { result, parse } = converted("letter-lands");
		expect(parse.bars).toHaveLength(76);
		expect(parse.sections.map((s) => s.firstBar)).toEqual([1, 5, 13, 21, 29, 37, 45, 53, 61, 69]);
		expect(starts(parse)[3]).toBe("II - Verse@21");
		expect(result.text).toContain("key: F#, time: 4/4, tempo: 132");
		expect(result.text).toContain("| B5(7) | B5(7) | F#5 | F#5 | C#5(7) | E5(7) |");
		expect(result.text).not.toMatch(/\\|♯|Structure/);
	});

	test("Letter Lands' bars match the bench's verified list, except the two Bridge bars the stored chart writes in another order", () => {
		const { parse } = converted("letter-lands");
		const want = benchBars("letter-lands");
		const got = benchChords(parse);
		const differ = got.flatMap((bar, i) =>
			JSON.stringify(bar) === JSON.stringify(want[i])
				? []
				: [`${i + 1}: ${bar.join(" ")} vs ${want[i]!.join(" ")}`],
		);
		// The bench transcribed the chart as fetched on 2026-10-29, whose Bridge is
		// D5(7) | D5(7) | E5(7) | E5(7); the stored text here reads D5(7) | E5(7) | D5(7) | E5(7).
		expect(differ).toEqual(["38: E5 vs D5", "39: D5 vs E5"]);
	});

	test("the bench's own copy of Letter Lands converts to exactly its 76 verified bars", () => {
		const result = legacyChartToBarmark(fixture("legacy/letter-lands-bench.md"));
		if (!result.ok) throw new Error(result.reasons.join("; "));
		const parse = parseChart(result.text);
		expect(parse.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
		expect(benchChords(parse)).toEqual(benchBars("letter-lands"));
	});

	test("Mop Heart converts: 140 bars in seven section occurrences, the Outro's key change as a key line", () => {
		const { result, parse } = converted("mop-heart");
		expect(parse.bars).toHaveLength(140);
		expect(starts(parse)).toEqual([
			"I - Intro@1",
			"II - Verse@5",
			"III - Chorus@21",
			"II - Verse@49",
			"III - Chorus@65",
			"II - Verse@93",
			"IV - Outro@125",
		]);
		expect(result.text).toContain("## II - Verse x2");
		expect(result.text).toContain("key: B\n## IV - Outro");
		expect(parse.bars[0]!.key).toEqual({ tonic: "A", mode: "major" });
		expect(parse.bars[124]!.key).toEqual({ tonic: "B", mode: "major" });
	});

	test("Interbellum converts as written: 37 bars, six sections, the footnote mark dropped and noted", () => {
		const { result, parse } = converted("interbellum");
		expect(parse.bars).toHaveLength(37);
		expect(starts(parse)).toEqual([
			"I - Verse@1",
			"II - Chorus@9",
			"III - Bridge@17",
			"IV - Interlude@25",
			"V - DAOM@27",
			"VI - Outro@35",
		]);
		expect(result.ok && result.notes).toContain('Line 2: dropped the footnote mark "**"');
		expect(result.text).toContain("| C | G C | x4\n");
	});

	test("Eat All the Clocks is refused: a word beside chords in the Bridge", () => {
		const result = legacyChartToBarmark(fixture("legacy/eat-all-the-clocks.md"));
		expect(result.ok).toBe(false);
		expect(!result.ok && result.reasons).toEqual([
			'Line 19: "riff" is not a chord, beside chords in "E5(7) | A5(7) | E5(7) | A5(7) | -- | -- | A5(7) riff x2"',
		]);
	});

	test("Peaceful Dreams is refused: its Structure names VI, Bridge and VII, which match no heading", () => {
		const result = legacyChartToBarmark(fixture("legacy/peaceful-dreams.md"));
		expect(result.ok).toBe(false);
		expect(!result.ok && result.reasons).toEqual([
			'Line 4: the Structure names "VI", which matches no section',
			'Line 4: the Structure names "Bridge", which matches no section',
			'Line 4: the Structure names "VII", which matches no section',
		]);
	});
});

describe("legacyChartToBarmark's rules", () => {
	const text = (md: string) => {
		const r = legacyChartToBarmark(md);
		if (!r.ok) throw new Error(r.reasons.join("; "));
		return r.text;
	};

	test("chord spellings in barmark's form", () => {
		expect(text("F♯(5)(7) | D(7)Sus4 | C#(7) | Bb(5)")).toBe("| F#5(7) | D7sus4 | C#7 | Bb5 |\n");
	});

	test("`/` or `%` alone is the previous bar, `--` silence, a repeated name a hold", () => {
		expect(text("D | / | % | -- | G G A")).toBe("| D | % | % | -- | G / A |\n");
	});

	test("a header in any order with bullets; a key it cannot spell is refused", () => {
		expect(text("Key: Bb minor · 90 bpm · 6/8\nD")).toBe("key: Bbm, time: 6/8, tempo: 90\n| D |\n");
		const r = legacyChartToBarmark("key: D dorian-ish・4/4\nD");
		expect(r.ok).toBe(false);
	});

	test("N.C. is refused for a human", () => {
		const r = legacyChartToBarmark("D | N.C. | A");
		expect(!r.ok && r.reasons[0]).toMatch(/N\.C\./);
	});

	test("a text line stating a tempo is refused; plain text is kept", () => {
		expect(legacyChartToBarmark("D | A\nfaster here, 140 bpm").ok).toBe(false);
		expect(text("D | A\nwatch Kevin for the cutoff")).toBe(
			"| D | A |\nwatch Kevin for the cutoff\n",
		);
	});

	test("an outline that plays sections out of written order is refused", () => {
		const r = legacyChartToBarmark("Structure: Chorus・Verse\n\n**Verse**\nD\n\n**Chorus**\nG");
		expect(r.ok).toBe(false);
	});

	test("an outline that leaves a written section out is refused", () => {
		const r = legacyChartToBarmark("Structure: Verse\n\n**Verse**\nD\n\n**Chorus**\nG");
		expect(!r.ok && r.reasons).toEqual(['Line 1: the Structure never plays "Chorus"']);
	});

	test("|: :| repeats are kept", () => {
		expect(text("|: D | A :| x3")).toBe("|: D | A :| x3\n");
	});
});
