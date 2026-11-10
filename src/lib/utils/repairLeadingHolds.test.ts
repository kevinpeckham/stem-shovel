import { parseChart } from "barmark";
import { describe, expect, test } from "vite-plus/test";
import { repairLeadingHolds } from "./repairLeadingHolds.js";

const READ = `# I Just Wanna Be—Yours
key: A, time: 4/4, tempo: 118

## Chorus
|: / | / | / |
|1 / :|
|2 / |

## Funk Break
| @B | Bm7 | E9 | Bm7 |`;

describe("repairLeadingHolds", () => {
	test("holds before the first chord become N.C., one cell at a time, until barmark plays the chart", () => {
		const fixed = repairLeadingHolds(READ);
		// The first cell names N.C.; the holds after it hold that, which barmark allows.
		expect(fixed).toContain("|: N.C. | / | / |\n|1 / :|\n|2 / |");
		expect(fixed).toContain("| @B | Bm7 | E9 | Bm7 |");
		expect(parseChart(fixed).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
	});

	test("a hold after a chord stays a hold, and a chart with no such error comes back as it was", () => {
		const chart = "key: A, time: 4/4\n\n| Bm7 | / | E9 | / |";
		expect(repairLeadingHolds(chart)).toBe(chart);
		expect(repairLeadingHolds("")).toBe("");
		const mixed = "key: A, time: 4/4\n\n| / | Bm7 | / |";
		expect(repairLeadingHolds(mixed)).toBe("key: A, time: 4/4\n\n| N.C. | Bm7 | / |");
		// Two chordless lines before the first chord: each line's first cell, in turn.
		const two = "key: A, time: 4/4\n\n| / | / |\n| / | Bm7 |";
		expect(repairLeadingHolds(two)).toBe("key: A, time: 4/4\n\n| N.C. | / |\n| / | Bm7 |");
	});
});
