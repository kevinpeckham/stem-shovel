import { beatsOf, parseMeter } from "barmark";
import { describe, expect, it } from "vite-plus/test";
import { barGrid, barSecondsAt } from "#lib/audio/measures.js";
import { listenDeclared } from "./listenDeclared";

/** The song's tempo and meter as @barmark/listen declares them: the tempo in barmark's beat, the bar the song's own. */
const changes = (meter: string, bpm: number, startAt: number | null = null) => {
	const list = [
		{ kind: "tempo" as const, start: 0, value: String(bpm) },
		{ kind: "meter" as const, start: 0, value: meter },
	];
	return { list, grid: barGrid(list, startAt)! };
};
/** The declared bar listen reckons from a `Declared`. */
const barOf = (d: { meter: string; tempo: number }) =>
	(beatsOf(parseMeter(d.meter)!) * 60) / d.tempo;

describe("listenDeclared", () => {
	it("a 4/4 song at 120 is 120 quarters, a two-second bar", () => {
		const { list, grid } = changes("4/4", 120);
		expect(listenDeclared(grid, list)).toEqual({ meter: "4/4", tempo: 120 });
	});

	it("a 6/8 song at 120 eighths is 40 dotted quarters, the song's three-second bar", () => {
		const { list, grid } = changes("6/8", 120);
		const declared = listenDeclared(grid, list);
		expect(declared).toEqual({ meter: "6/8", tempo: 40 });
		expect(barOf(declared)).toBe(barSecondsAt(grid, 0));
		expect(barOf(declared)).toBe(3);
	});

	it("12/8 at 96 eighths and 3/4 at 90 keep the song's bar and beats", () => {
		const twelve = changes("12/8", 96);
		expect(listenDeclared(twelve.grid, twelve.list)).toEqual({ meter: "12/8", tempo: 32 });
		const three = changes("3/4", 90);
		expect(listenDeclared(three.grid, three.list)).toEqual({ meter: "3/4", tempo: 90 });
	});

	it("reads the meter and the bar in force at the song's start of bar 1", () => {
		const list = [
			{ kind: "tempo" as const, start: 0, value: "120" },
			{ kind: "meter" as const, start: 0, value: "4/4" },
			{ kind: "tempo" as const, start: 10, value: "90" },
			{ kind: "meter" as const, start: 10, value: "6/8" },
		];
		const grid = barGrid(list, 12)!;
		const declared = listenDeclared(grid, list);
		expect(declared.meter).toBe("6/8");
		expect(barOf(declared)).toBeCloseTo(barSecondsAt(grid, 12), 12);
	});

	it("a meter it cannot read, or one that disagrees with the grid's beats, counts the grid's beats in quarters", () => {
		const { grid } = changes("6/8", 120);
		const declared = listenDeclared(grid, [{ kind: "meter", start: 0, value: "free" }]);
		expect(declared.meter).toBe("6/4");
		expect(barOf(declared)).toBe(3);
		expect(listenDeclared(grid, []).meter).toBe("6/4");
	});
});
