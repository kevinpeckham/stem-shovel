import type { SongChange } from "#lib/val/SongChangeSchema.js";
import { describe, expect, test } from "vite-plus/test";
import {
	barAt,
	barGrid,
	formatBarSpan,
	formatPosition,
	parsePosition,
	barSecondsAt,
	secondsAtBar,
	snapToAnchor,
	snapToDownbeat,
	nextBeatAt,
	countInBeats,
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
	test("a downbeat stored to a tenth of a millisecond still reads as beat 1", () => {
		// 68 bpm: bar 21 begins at 70.588235…, saved as 70.5882 (data.ts rounds starts).
		const grid = barGrid(
			[
				{ kind: "tempo", start: 0, value: "68" },
				{ kind: "meter", start: 0, value: "4/4" },
			],
			null,
		)!;
		expect(barAt(grid, 70.5882)).toMatchObject({ bar: 21, beat: 1 });
		expect(barAt(grid, 56.4706)).toMatchObject({ bar: 17, beat: 1 });
	});
	test("secondsAtBar inverts it exactly", () => {
		for (const t of [0, 2, 3.5, 8, 10, 16, 19, 20.25]) {
			const p = barAt(grid, t);
			expect(secondsAtBar(grid, p.bar, p.beat, p.fraction)).toBeCloseTo(t, 6);
		}
	});
});

describe("nextBeatAt", () => {
	const grid = {
		tempos: [{ start: 0, bpm: 120 }],
		meters: [{ start: 0, beatsPerBar: 4 }],
		startAt: 1,
	};
	test("the beat under a position when it sits on one, else the next", () => {
		expect(nextBeatAt(grid, 1)).toEqual({ at: 1, accent: true, bar: 1, beat: 1 });
		expect(nextBeatAt(grid, 1.1)).toEqual({ at: 1.5, accent: false, bar: 1, beat: 2 });
		expect(nextBeatAt(grid, 2.5)).toEqual({ at: 2.5, accent: false, bar: 1, beat: 4 });
		expect(nextBeatAt(grid, 2.6)).toEqual({ at: 3, accent: true, bar: 2, beat: 1 });
		// A hair before a line reads as the line (barAt's slack).
		expect(nextBeatAt(grid, 2.99995).at).toBeCloseTo(3, 9);
	});
	test("counts down through bar 0 before the start, accents on its own downbeat", () => {
		expect(nextBeatAt(grid, 0)).toEqual({ at: 0, accent: false, bar: 0, beat: 3 });
		expect(nextBeatAt(grid, -1)).toEqual({ at: -1, accent: true, bar: 0, beat: 1 });
	});
	test("follows a tempo change", () => {
		const g = {
			...grid,
			startAt: 0,
			tempos: [
				{ start: 0, bpm: 120 },
				{ start: 2, bpm: 60 },
			],
		};
		expect(nextBeatAt(g, 2.1).at).toBeCloseTo(3, 9);
	});
});

describe("countInBeats", () => {
	const grid = {
		tempos: [{ start: 0, bpm: 120 }],
		meters: [{ start: 0, beatsPerBar: 4 }],
		startAt: 0,
	};
	test("a bar before the start: four beats of bar −1, held for the whole bar", () => {
		const c = countInBeats(grid, 0, 1);
		expect(c.beats.map((b) => [b.at, b.bar, b.beat])).toEqual([
			[-2, -1, 1],
			[-1.5, -1, 2],
			[-1, -1, 3],
			[-0.5, -1, 4],
		]);
		expect(c.hold).toBe(2);
	});
	test("two bars count −2 then −1; none counts nothing", () => {
		const c = countInBeats(grid, 0, 2);
		expect(c.beats).toHaveLength(8);
		expect(c.beats[0]).toEqual({ at: -4, bar: -2, beat: 1 });
		expect(c.beats[4]).toEqual({ at: -2, bar: -1, beat: 1 });
		expect(countInBeats(grid, 0, 0)).toEqual({ beats: [], hold: 0 });
	});
	test("from mid-bar the count-in leads to the next beat line, the stems entering before it", () => {
		// 2.25 s is bar 2, beat 1 and a half: the entry is beat 2 at 2.5; the four beats before it are 0.5 s to 2 s.
		const c = countInBeats(grid, 2.25, 1);
		expect(c.beats.map((b) => b.at)).toEqual([0.5, 1, 1.5, 2]);
		expect(c.beats.map((b) => [b.bar, b.beat])).toEqual([
			[-1, 2],
			[-1, 3],
			[-1, 4],
			[0, 1],
		]);
		expect(c.hold).toBeCloseTo(1.75, 9);
	});
	test("with bar 1 after leading silence the count-in sits in the silence and the hold shrinks", () => {
		const late = { ...grid, startAt: 1 };
		const c = countInBeats(late, 0, 1);
		expect(c.beats.map((b) => b.at)).toEqual([-1, -0.5, 0, 0.5]);
		expect(c.hold).toBe(1);
	});
});

describe("snapToDownbeat", () => {
	// 120 bpm 4/4: a bar is 2 s, a beat 0.5 s.
	const grid = barGrid(changes.slice(0, 2), null)!;
	test("a time on the and of four goes to the next bar; a beat late comes back to this one", () => {
		expect(snapToDownbeat(grid, 3.75)).toBe(4);
		expect(snapToDownbeat(grid, 4.4)).toBe(4);
		expect(snapToDownbeat(grid, 4)).toBe(4);
	});
	test("a time in the middle of the bar stays where it is", () => {
		expect(snapToDownbeat(grid, 5)).toBe(5);
		expect(snapToDownbeat(grid, 4.8)).toBe(4.8);
	});
	test("counts beats, so a slow tempo snaps across more seconds", () => {
		const slow = barGrid(
			[
				{ kind: "tempo", start: 0, value: "60" },
				{ kind: "meter", start: 0, value: "4/4" },
			],
			null,
		)!;
		expect(snapToDownbeat(slow, 7.2)).toBe(8);
		expect(snapToDownbeat(slow, 6.4)).toBe(6.4);
	});
	test("before the start and in a bar before it, unchanged", () => {
		const late = barGrid(changes.slice(0, 2), 10)!;
		expect(snapToDownbeat(late, 3)).toBe(3);
		expect(snapToDownbeat(late, 11.8)).toBe(12);
	});
});

describe("snapToAnchor / barSecondsAt", () => {
	test("moves onto the nearest anchor within reach, else stays", () => {
		expect(snapToAnchor(31, [0, 30, 60], 2)).toBe(30);
		expect(snapToAnchor(29.5, [0, 30, 60], 2)).toBe(30);
		expect(snapToAnchor(33, [0, 30, 60], 2)).toBe(33);
		expect(snapToAnchor(45, [], 2)).toBe(45);
	});
	test("a bar's length follows the tempo and meter in force", () => {
		const grid = barGrid(changes, null)!;
		expect(barSecondsAt(grid, 1)).toBeCloseTo(2);
		expect(barSecondsAt(grid, 9)).toBeCloseTo(4);
		expect(barSecondsAt(grid, 17)).toBeCloseTo(3);
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
