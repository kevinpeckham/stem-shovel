import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { barmarkChartBars } from "./barmarkChartBars.js";

const SONG = { tempo: 120, meter: "4/4" };
const NONE = { tempo: null, meter: null };
const NONE_METER = { tempo: 120, meter: null };

/** The grammar's "At a glance" example (barmark grammar v0.1). */
const EXAMPLE = `# Example Song
key: D, time: 4/4, tempo: 145

## Intro
| {D2} | / | / | / |

## Verse
|: D | A | Bm | G :|
| Em | / | A | A7 |

## Chorus
| G / D / | A | Bm / / A | G |
| G | A | D / / /_G | / |

## Verse
## Chorus x2

## Bridge
feel: swing
| Em7 | A7(b9) | Dmaj7 | Bm7 |
| G -- -- -- | G -- -- -- | N.C. | ? |
feel: straight

## Outro
| D | A | [2/4] D | ... |
`;

const chordsOf = (md: string) => barmarkChartBars(md, SONG)?.bars.map((b) => b.chords);

describe("barmarkChartBars: the grammar's example", () => {
	const read = barmarkChartBars(EXAMPLE, NONE)!;
	const bar = (n: number) => read.bars[n - 1]!;

	it("plays 63 bars in order: repeats, replays and x2 expanded, the fermata not counted", () => {
		expect(read.bars).toHaveLength(63);
		expect(read.bars.map((b) => b.measure)).toEqual(read.bars.map((_, i) => i + 1));
	});
	it("marks the bar each section occurrence begins, replays included", () => {
		const sections = read.bars.filter((b) => b.section).map((b) => [b.section, b.measure]);
		expect(sections).toEqual([
			["Intro", 1],
			["Verse", 5],
			["Chorus", 17],
			["Verse", 25],
			["Chorus", 37],
			["Bridge", 53],
			["Outro", 61],
		]);
	});
	it("takes tempo, meter and key from the directives, a one-bar meter for its bar", () => {
		expect(bar(1)).toMatchObject({ bpm: 145, meter: "4/4", key: "D major" });
		expect(bar(63)).toMatchObject({ meter: "2/4", chords: ["D"] });
		expect(bar(62).meter).toBe("4/4");
	});
	it("reads a note set by its canonical form and a hold bar as []", () => {
		expect(read.bars.slice(0, 4).map((b) => b.chords)).toEqual([["{D2}"], [], [], []]);
	});
	it("repeats the symbol before a hold so the slots divide the bar", () => {
		expect(bar(17).chords).toEqual(["G", "G", "D", "D"]);
		expect(bar(19).chords).toEqual(["Bm", "Bm", "Bm", "A"]);
	});
	it("reads silence and no-chord as N.C., a `?` as a hold, with a warning", () => {
		expect(bar(57).chords).toEqual(["G", "N.C.", "N.C.", "N.C."]);
		expect(bar(59).chords).toEqual(["N.C."]);
		expect(bar(60).chords).toEqual([]);
		expect(bar(54).chords).toEqual(["A7(b9)"]);
		expect(read.warnings).toContain("Line 21: unknown harmony (?)");
		expect(read.warnings).toContain("Line 21: unknown harmony `?` read as a hold");
	});
	it("reads a group by its first member, with one warning for the chart", () => {
		expect(bar(23).chords).toEqual(["D", "D", "D", "D"]);
		const grouped = read.warnings.filter((w) => w.includes("first member"));
		expect(grouped).toHaveLength(1);
	});
	it("ignores the feel line", () => {
		expect(read.warnings).toHaveLength(3);
	});
});

describe("barmarkChartBars: holds", () => {
	it("splits `| Am7 / / G7 |` into four equal slots", () => {
		expect(chordsOf("| Am7 / / G7 |")).toEqual([["Am7", "Am7", "Am7", "G7"]]);
	});
	it("carries the previous bar's last harmony into a leading hold", () => {
		expect(chordsOf("| C G | / D |")).toEqual([
			["C", "G"],
			["G", "D"],
		]);
		expect(chordsOf("| C G | / | / A |")).toEqual([["C", "G"], [], ["G", "A"]]);
		expect(chordsOf("| -- | / D |")).toEqual([["N.C."], ["N.C.", "D"]]);
	});
	it("drops a leading hold with nothing before it, with a warning", () => {
		const read = barmarkChartBars("| / D | A |", SONG)!;
		expect(read.bars.map((b) => b.chords)).toEqual([["D"], ["A"]]);
		expect(read.warnings).toEqual([
			"Line 1: / has nothing before it to hold (/)",
			"Line 1: a hold with no harmony before it was left out",
		]);
	});
	it("expands simile and keeps holds", () => {
		expect(chordsOf("| C G | % | / |")).toEqual([["C", "G"], ["C", "G"], []]);
	});
});

describe("barmarkChartBars: tempo, meter, key and the null contracts", () => {
	it("takes the song's tempo when the chart gives none, and the chart's over it", () => {
		expect(barmarkChartBars("| D |", SONG)?.bars[0]?.bpm).toBe(120);
		expect(barmarkChartBars("tempo: 90\n| D |", SONG)?.bars[0]?.bpm).toBe(90);
	});
	it("follows a tempo change from the next bar", () => {
		const read = barmarkChartBars("| D |\ntempo: 100\n| A |", SONG)!;
		expect(read.bars.map((b) => b.bpm)).toEqual([120, 100]);
	});
	it("defaults the meter to 4/4 and gives no key when none is set", () => {
		expect(barmarkChartBars("| D |", SONG)?.bars[0]).toMatchObject({ meter: "4/4", key: null });
		expect(barmarkChartBars("| D |", NONE_METER)?.bars[0].meter).toBe("4/4");
	});

	it("a chart without a time: line takes the song's meter; a time: line or a one-bar meter wins", () => {
		const waltz = { tempo: 224, meter: "3/4" };
		expect(barmarkChartBars("| C | G C |", waltz)?.bars.map((b) => b.meter)).toEqual([
			"3/4",
			"3/4",
		]);
		expect(barmarkChartBars("| C | [2/4] G |", waltz)?.bars.map((b) => b.meter)).toEqual([
			"3/4",
			"2/4",
		]);
		expect(barmarkChartBars("time: 4/4\n| C | G |", waltz)?.bars.map((b) => b.meter)).toEqual([
			"4/4",
			"4/4",
		]);
	});
	it("names modes and minor keys", () => {
		expect(barmarkChartBars("key: F#m\n| D |", SONG)?.bars[0]?.key).toBe("F# minor");
		expect(barmarkChartBars("key: A mixolydian\n| D |", SONG)?.bars[0]?.key).toBe("A mixolydian");
	});
	it("is null with no tempo in the chart or the defaults", () => {
		expect(barmarkChartBars("| D | A |", NONE)).toBeNull();
	});
	it("is null when no bar plays", () => {
		expect(barmarkChartBars("", SONG)).toBeNull();
		expect(barmarkChartBars("Just some words.", SONG)).toBeNull();
		expect(barmarkChartBars("| riff | D |", SONG)).toBeNull();
	});
	it("writes every diagnostic as a warning line, errors and warnings, with a suggestion", () => {
		const read = barmarkChartBars("meter: 3/4\n| D | A |\n| E | 2x\n| D | A", SONG)!;
		expect(read.bars.map((b) => b.chords)).toEqual([["D"], ["A"], ["D"], ["A"]]);
		expect(read.warnings).toEqual([
			"Line 1: not a directive; did you mean time:? (meter: 3/4) → time: 3/4",
			"Line 3: a repeat is written x N after the final | (2x) → x2",
			"Line 3: missing trailing | (2x)",
			"Line 4: missing trailing | (A)",
		]);
	});
});

describe("barmarkChartBars: the band's charts (stem-bench corpus)", () => {
	const fixture = (name: string) =>
		readFileSync(new URL(`../../../tests/fixtures/charts/${name}.md`, import.meta.url), "utf8");
	const cases: [string, number, number][] = [
		["letter-lands", 76, 10],
		["peaceful-dreams", 152, 10],
		["eat-all-the-clocks", 86, 9],
	];
	for (const [name, bars, sections] of cases) {
		it(`${name}: ${bars} bars, ${sections} sections, one error for line 1's key`, () => {
			const read = barmarkChartBars(fixture(name), SONG)!;
			expect(read.bars).toHaveLength(bars);
			expect(read.bars.filter((b) => b.section)).toHaveLength(sections);
			expect(read.bars.every((b) => b.bpm === 120 && b.meter === "4/4" && b.key === null)).toBe(
				true,
			);
			expect(read.warnings).toHaveLength(1);
			expect(read.warnings[0]).toMatch(/^Line 1: key must be/);
		});
	}
});
