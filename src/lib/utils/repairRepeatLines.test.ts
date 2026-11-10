import { parseChart } from "barmark";
import { describe, expect, test } from "vite-plus/test";
import { repairRepeatLines } from "./repairRepeatLines.js";

const READ = `# Not OK Without You
part: Electric Guitar 1
key: A, time: 4/4, tempo: 140

## Verse
| @A |: A | / | Dmaj9 |1 / :|
|2 / | A | N.C. | Dmaj9 |

## Chorus
| @B | / | G | D | G | D6 |
| G | D Bm7 | E | E7/D |
|: A | / | Dmaj9 |1 / :|
|2 / |

## Solo
| @C | E/G# | / | D6 | / | C#m7 | / |
| Dmaj9 | / |`;

const errors = (text: string) =>
	parseChart(text)
		.diagnostics.filter((d) => d.severity === "error")
		.map((d) => `L${d.line} ${d.message}`);

describe("repairRepeatLines", () => {
	test("a repeat start after a rehearsal mark and endings mid-line each get a line of their own, and the chart parses with the score's bar numbers", () => {
		const fixed = repairRepeatLines(READ);
		expect(fixed).toContain("| @A |\n|: A | / | Dmaj9 |\n|1 / :|\n|2 / | A | N.C. | Dmaj9 |");
		expect(fixed).toContain("| E7/D |\n|: A | / | Dmaj9 |\n|1 / :|\n|2 / |");
		expect(errors(fixed)).toEqual([]);
		// The bars are played bars (a repeated bar twice, its mark on both passes); their written numbers match the score's (the Solo at 23).
		const marks = parseChart(fixed).bars.filter(
			(b, i, all) => b.rehearsal && all.findIndex((o) => o.written === b.written) === i,
		);
		expect(marks.map((b) => [b.rehearsal, b.written])).toEqual([
			["A", 1],
			["B", 9],
			["C", 23],
		]);
	});

	test("a second ending run on after :| on the same line starts its own line", () => {
		const fixed = repairRepeatLines("key: A, time: 4/4\n\n|: A | / | D |1 / :|2 / | A |");
		expect(fixed).toBe("key: A, time: 4/4\n\n|: A | / | D |\n|1 / :|\n|2 / | A |");
		expect(errors(fixed)).toEqual([]);
	});

	test("a chart whose repeats already sit on their own lines comes back as it was", () => {
		const clean = "key: A, time: 4/4\n\n| @A |\n|: A | / | D |\n|1 / :|\n|2 / | A |";
		expect(repairRepeatLines(clean)).toBe(clean);
	});
});
