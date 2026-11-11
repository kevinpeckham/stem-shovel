import { describe, expect, test } from "vite-plus/test";
import { reflowChartRows } from "./reflowChartRows.js";

const head = "# Caught You Thinking\nkey: C, time: 4/4, tempo: 124\n\n";

describe("reflowChartRows", () => {
	test("a long row splits into rows of four bars; a rehearsal mark stays with the bar after it", () => {
		const read = `${head}## Verse\n| @A | Fmaj9 | / | Em7 | / | Fmaj9 | / | Em7 | / |\n| Fmaj9 | / | Em7 | / | C7 | / |`;
		expect(reflowChartRows(read)).toBe(
			`${head}## Verse\n| @A | Fmaj9 | / | Em7 | / |\n| Fmaj9 | / | Em7 | / |\n| Fmaj9 | / | Em7 | / |\n| C7 | / |`,
		);
	});

	test("a repeat spans the rows it needs: |: on the first, :| on the last; a first ending reflows to its :| (barmark 0.23), the last ending stays one line", () => {
		expect(reflowChartRows(`${head}|: A | B | C | D | E | F :|`)).toBe(
			`${head}|: A | B | C | D |\n| E | F :|`,
		);
		const endings = `${head}|: A | B | C | D | E | F |\n|1 G | A | B | C | D :|\n|2 G | A | B | C | D |\n| E | F |`;
		expect(reflowChartRows(endings)).toBe(
			`${head}|: A | B | C | D |\n| E | F |\n|1 G | A | B | C |\n| D :|\n|2 G | A | B | C | D |\n| E | F |`,
		);
		// Short first-ending rows join up to the :| too.
		const split = `${head}|: A | B |\n|1 G | A |\n| B | C |\n| D :|\n|2 G |`;
		expect(reflowChartRows(split)).toBe(`${head}|: A | B |\n|1 G | A | B | C |\n| D :|\n|2 G |`);
	});

	test("a direction goes with the bar after it and does not count as a bar", () => {
		expect(reflowChartRows(`${head}| C | F | G | To Coda | C | Segno | F | G | C |`)).toBe(
			`${head}| C | F | G | To Coda | C |\n| Segno | F | G | C |`,
		);
	});

	test("short rows join into fours within a run of plain bar lines; a heading or a directive ends the run, a repeat gathers to its :| and no further", () => {
		const read = `${head}## Verse\n| @A | Bbm7 | / | / | / |\n| Ebm7 |\n| / | Bbm7 | / |\n## Chorus\n| @C | Bb | / |\n| / | / | Ebm7 |\nkey: Db\n| B7/Gb | Bbm7 |\n|: Db7 | Fm7 |\n| Cb7 :|\n| Gb7 |`;
		expect(reflowChartRows(read)).toBe(
			`${head}## Verse\n| @A | Bbm7 | / | / | / |\n| Ebm7 | / | Bbm7 | / |\n## Chorus\n| @C | Bb | / | / | / |\n| Ebm7 |\nkey: Db\n| B7/Gb | Bbm7 |\n|: Db7 | Fm7 | Cb7 :|\n| Gb7 |`,
		);
	});

	test("rows of four, headings, directives and lyrics are untouched", () => {
		const clean = `${head}## Verse\n| C | F | G | C |\nkey: F\n| F | Bb |\nlyrics 1: Caught you thinking`;
		expect(reflowChartRows(clean)).toBe(clean);
	});

	test("a line with an unreadable chord reflows with the others, its error kept (barmark 0.23 keeps the bar)", () => {
		const broken = `${head}| C | F | G | C | Hmaj9 | F | G | C |`;
		expect(reflowChartRows(broken)).toBe(`${head}| C | F | G | C |\n| Hmaj9 | F | G | C |`);
	});

	test("the result is kept only when it plays the same bars with the same errors", () => {
		// A last ending followed by a plain row: joining them would move the row into the ending, so the run is left as written.
		const tail = `${head}|: A | B |\n|1 C :|\n|2 D |\n| E | F |`;
		expect(reflowChartRows(tail)).toBe(tail);
	});
});
