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
	test("stacked alterations are respelled the way barmark reads them, and the chart then parses clean", () => {
		const fixed = repairChordSpellings(READ);
		expect(fixed).toContain("| Gsus4 F#(b5,omit3) |");
		expect(fixed).toContain("| D6(omit5,add9) |");
		expect(fixed).toContain("| Gadd9(omit3) |");
		expect(fixed).toContain("| G(omit5) Gsus4 A/G |");
		expect(parseChart(fixed).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
	});

	test("a chart with no unreadable chord comes back as it was; a chord no rule can respell is left alone", () => {
		const clean = "key: G, time: 4/4\n\n| G(omit5) | F#m7b5 | C7(#9,b13) |";
		expect(repairChordSpellings(clean)).toBe(clean);
		const odd = "key: G, time: 4/4\n\n| Gxyz |";
		expect(repairChordSpellings(odd)).toBe(odd);
	});
});
