import type { SongChange } from "$lib/val/SongChangeSchema";
import { describe, expect, test } from "vite-plus/test";
import {
	barAt,
	barGrid,
	formatBarSpan,
	formatPosition,
	parsePosition,
	secondsAtBar,
} from "./measures";

const changes: SongChange[] = [
	{ kind: "tempo", start: 0, value: "120" },
	{ kind: "meter", start: 0, value: "4/4" },
	{ kind: "tempo", start: 8, value: "60" },
	{ kind: "meter", start: 16, value: "3/4" },
];

describe("barGrid", () => {
	test("needs a tempo and a meter", () => {
		expect(barGrid([{ kind: "tempo", start: 0, value: "120" }], null)).toBeNull();
		expect(barGrid([{ kind: "meter", start: 0, value: "4/4" }], null)).toBeNull();
		expect(barGrid(changes, null)).not.toBeNull();
	});
	test("ignores unusable values", () => {
		expect(
			barGrid(
				[
					{ kind: "tempo", start: 0, value: "fast" },
					{ kind: "meter", start: 0, value: "4/4" },
				],
				null,
			),
		).toBeNull();
	});
});

describe("barAt", () => {
	const grid = barGrid(changes, 2)!; // bar 1 at 2 s
	const pos = (t: number) => {
		const p = barAt(grid, t);
		return `${p.bar}|${p.beat}`;
	};
	test("counts from the start, through a tempo change and a meter change", () => {
		expect(pos(2)).toBe("1|1");
		expect(pos(3.5)).toBe("1|4");
		expect(pos(4)).toBe("2|1");
		expect(pos(8)).toBe("4|1"); // 6 s at 120 bpm = 12 beats = 3 bars
		expect(pos(10)).toBe("4|3"); // 2 s at 60 bpm = 2 beats
		expect(pos(16)).toBe("6|1"); // 8 s at 60 bpm = 8 beats = 2 bars
		expect(pos(19)).toBe("7|1"); // 3/4 from here: 3 beats a bar
		expect(pos(20)).toBe("7|2");
	});
	test("runs through bar 0 before the start, like a DAW", () => {
		expect(pos(0)).toBe("0|1");
		expect(pos(1.5)).toBe("0|4");
	});
	test("secondsAtBar inverts it exactly", () => {
		for (const t of [0, 2, 3.5, 8, 10, 16, 19, 20.25]) {
			const p = barAt(grid, t);
			expect(secondsAtBar(grid, p.bar, p.beat, p.fraction)).toBeCloseTo(t, 6);
		}
	});
});

describe("parsePosition / formatPosition", () => {
	const grid = barGrid(
		[
			{ kind: "tempo", start: 0, value: "120" },
			{ kind: "meter", start: 0, value: "4/4" },
		],
		0,
	)!;
	const ctx = { fps: 25, grid };
	test("detects the format from the text", () => {
		expect(parsePosition("1:23.4", ctx)).toBe(83.4);
		expect(parsePosition("83", ctx)).toBe(83);
		expect(parsePosition("00:01:23.10", ctx)).toBeCloseTo(1.925, 3);
		expect(parsePosition("5|3", ctx)).toBe(9); // 4 bars × 4 beats + 2 beats at 120 bpm
		expect(parsePosition("5|3|0.5", ctx)).toBe(9.25);
		expect(parsePosition("nope", ctx)).toBeNull();
	});
	test("bars need a grid", () => {
		expect(parsePosition("5|3", { fps: 25, grid: null })).toBeNull();
	});
	test("formats in each mode; precise editors keep fractions; plain time still parses", () => {
		expect(parsePosition("1:28.25", ctx)).toBe(88.25);
		expect(formatPosition("timecode", 10, ctx)).toBe("00:10:00.00");
		expect(formatPosition("bars", 88.25, ctx)).toBe("45 | 1");
		expect(formatPosition("bars", 88.25, ctx, { precise: true })).toBe("45 | 1 | 0.5");
		expect(formatPosition("bars", 10, { fps: 25, grid: null })).toBe("00:10:00.00"); // no grid: timecode
	});
	test("round-trips through every format", () => {
		for (const mode of ["timecode", "bars"] as const) {
			const text = formatPosition(mode, 88.25, ctx, { precise: true });
			expect(parsePosition(text, ctx)).toBeCloseTo(88.25, 2);
		}
	});
});

describe("formatBarSpan", () => {
	const grid = barGrid(
		[
			{ kind: "tempo", start: 0, value: "120" },
			{ kind: "meter", start: 0, value: "4/4" },
		],
		0,
	)!;
	test("bars and leftover beats in the meter where the span starts", () => {
		expect(formatBarSpan(grid, 0, 16)).toBe("8 bars");
		expect(formatBarSpan(grid, 0, 17)).toBe("8 bars 2 beats");
		expect(formatBarSpan(grid, 0, 2)).toBe("1 bar");
		expect(formatBarSpan(grid, 0, 0.5)).toBe("1 beat");
		expect(formatBarSpan(grid, 3, 3)).toBe("0 bars");
	});
});
