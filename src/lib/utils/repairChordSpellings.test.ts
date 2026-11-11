import { parseChart } from "barmark";
import { describe, expect, test } from "vite-plus/test";
import { repairChordSpellings } from "./repairChordSpellings.js";

const READ = `# Hard to (For)get
key: G, time: 4/4, tempo: 124

## Verse
| G(omit5) Gsus4 A/G | Gsus4 F#b5(omit3) | G(omit5) |

## Chorus
| @B | G | D6(omit5add9) | C | / | G |
| Gadd9omit3 | Em7 | B | Cmaj9 |`;

describe("repairChordSpellings", () => {
	test("stacked alterations take barmark's own suggestion, and the chart then parses with no diagnostic at all", () => {
		const fixed = repairChordSpellings(READ);
		expect(fixed).toContain("| Gsus4 F#(b5,omit3) |");
		expect(fixed).toContain("| D6(omit5,add9) |");
		expect(fixed).toContain("| Gadd9(omit3) |");
		expect(fixed).toContain("| G(omit5) Gsus4 A/G |");
		// What remains is the fixture's own three-chord bar (slots), not a spelling.
		expect(parseChart(fixed).diagnostics.map((d) => d.message)).toEqual([
			"3 slots divide 4 beats unevenly",
		]);
	});

	test("a clean chart comes back as it was; a token barmark offers no suggestion for is left alone", () => {
		const clean = "key: G, time: 4/4\n\n| G(omit5) | F#m7b5 | C7(#9,b13) |";
		expect(repairChordSpellings(clean)).toBe(clean);
		// `Gxyz` has no suggestion; `Gb5(omit3)` could be a power chord, so barmark suggests nothing.
		for (const odd of ["key: G, time: 4/4\n\n| Gxyz |", "| Gb5(omit3) | D |"]) {
			expect(repairChordSpellings(odd)).toBe(odd);
		}
	});

	test("a suggestion that rewrites a cell (a rehearsal mark with words) is not a spelling and is left to repairRehearsalCells", () => {
		const cell = '| @B "Play 3 times" C |';
		expect(repairChordSpellings(cell)).toBe(cell);
	});
});
