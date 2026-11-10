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

	test("a repeat spans the rows it needs: |: on the first, :| on the last; an ending stays one line", () => {
		expect(reflowChartRows(`${head}|: A | B | C | D | E | F :|`)).toBe(
			`${head}|: A | B | C | D |\n| E | F :|`,
		);
		const endings = `${head}|: A | B | C | D | E | F |\n|1 G | A | B | C | D :|\n|2 G |`;
		expect(reflowChartRows(endings)).toBe(
			`${head}|: A | B | C | D |\n| E | F |\n|1 G | A | B | C | D :|\n|2 G |`,
		);
	});

	test("a direction goes with the bar after it and does not count as a bar", () => {
		expect(reflowChartRows(`${head}| C | F | G | To Coda | C | Segno | F | G | C |`)).toBe(
			`${head}| C | F | G | To Coda | C |\n| Segno | F | G | C |`,
		);
	});

	test("rows of four or fewer, headings, directives and lyrics are untouched", () => {
		const clean = `${head}## Verse\n| C | F | G | C |\nkey: F\n| F | Bb |\nlyrics 1: Caught you thinking`;
		expect(reflowChartRows(clean)).toBe(clean);
	});

	test("a line barmark cannot read is left as it is, so a split never hides an error", () => {
		const broken = `${head}| C | F | G | C | Hmaj9 | F | G | C |`;
		expect(reflowChartRows(broken)).toBe(broken);
	});
});
