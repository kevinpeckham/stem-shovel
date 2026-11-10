import { parseChart } from "barmark";
import { describe, expect, test } from "vite-plus/test";
import { repairRehearsalCells } from "./repairRehearsalCells.js";

const READ = `# You Get What You Want
key: C, time: 4/4, tempo: 146

| F |

## Verse
|: @A G | / | F |
|1,3 F /_Em / F :|
|2 F /_Em / Am7 :|
|4 F | F |

## Chorus
key: F
|: @B "Play 3 times" C | / | Bb(add9,omit3) | F :|
key: C
| G | / |

## Transition to chorus
| @D F | / |`;

describe("repairRehearsalCells", () => {
	test("a mark fused with its bar, with or without words, gets a cell of its own, and the chart then parses", () => {
		const fixed = repairRehearsalCells(READ);
		expect(fixed).toContain("|: @A | G | / | F |");
		expect(fixed).toContain('|: @B | "Play 3 times" C | / | Bb(add9,omit3) | F :|');
		expect(fixed).toContain("| @D | F | / |");
		expect(parseChart(fixed).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
		expect(parseChart(fixed).bars.filter((b) => b.rehearsal && b.written === 2)[0]?.rehearsal).toBe(
			"A",
		);
	});

	test("a chart whose marks already stand alone comes back as it was", () => {
		const clean = "key: C, time: 4/4\n\n| @A | F | C |\n|: @B | G :|";
		expect(repairRehearsalCells(clean)).toBe(clean);
	});
});
