import * as v from "valibot";
import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_DRUM_FX } from "#lib/constants/drumMachine.js";
import type { DrumProject } from "#lib/val/DrumPatternSchema.js";
import { ExpressionProjectSchema } from "#lib/val/ExpressionDrumSchema.js";
import { expressionProjectFromDrumProject } from "./expressionProjectFromDrumProject";
import { readExpressionProject } from "./readExpressionProject";

const old = (): DrumProject => ({
	v: 2,
	bpm: 96,
	swing: 0.3,
	swingGrid: 8,
	humanize: 0.1,
	kit: "acoustic",
	fx: { ...DEFAULT_DRUM_FX },
	timeline: [0, 1, 1],
	patterns: [
		{
			meter: "3/4",
			steps: 12,
			rows: [
				{
					voice: "kick",
					level: 0.9,
					pan: -0.2,
					mute: false,
					delaySend: 0.1,
					reverbSend: 0.2,
					cells: [3, 0, 0, 2, 0, 0, 1, 0, 0, 0, 0, 0],
				},
			],
		},
		{
			meter: "4/4",
			steps: 8,
			rows: [
				{
					voice: "snare",
					level: 0.7,
					pan: 0,
					mute: true,
					delaySend: 0,
					reverbSend: 0,
					cells: [0, 0, 3, 0, 0, 0, 3, 0],
				},
			],
		},
	],
});

describe("expressionProjectFromDrumProject", () => {
	it("maps velocities 1→1, 2→3, 3→5 onto the main hit, no off-grid hits", () => {
		const cells = expressionProjectFromDrumProject(old()).patterns[0]!.rows[0]!.cells;
		expect(cells.slice(0, 7)).toEqual([
			{ main: 5, t1: 0, half: 0, t2: 0 },
			{ main: 0, t1: 0, half: 0, t2: 0 },
			{ main: 0, t1: 0, half: 0, t2: 0 },
			{ main: 3, t1: 0, half: 0, t2: 0 },
			{ main: 0, t1: 0, half: 0, t2: 0 },
			{ main: 0, t1: 0, half: 0, t2: 0 },
			{ main: 1, t1: 0, half: 0, t2: 0 },
		]);
	});
	it("keeps everything else: tempo, swing, kit, effects, meters, steps, mix", () => {
		const p = expressionProjectFromDrumProject(old());
		expect(p).toMatchObject({ bpm: 96, swing: 0.3, swingGrid: 8, humanize: 0.1, kit: "acoustic" });
		expect(p.fx).toEqual(DEFAULT_DRUM_FX);
		expect(p.patterns.map((x) => [x.meter, x.steps])).toEqual([
			["3/4", 12],
			["4/4", 8],
		]);
		expect(p.patterns[1]!.rows[0]).toMatchObject({ voice: "snare", level: 0.7, mute: true });
		expect(p.patterns[0]!.rows[0]).toMatchObject({ pan: -0.2, delaySend: 0.1, reverbSend: 0.2 });
	});
	it("each timeline entry becomes a bar played once", () => {
		expect(expressionProjectFromDrumProject(old()).timeline).toEqual([
			{ pattern: 0, reps: 1 },
			{ pattern: 1, reps: 1 },
			{ pattern: 1, reps: 1 },
		]);
	});
	it("the result passes the expression schema", () => {
		expect(v.safeParse(ExpressionProjectSchema, expressionProjectFromDrumProject(old())).success).toBe(true);
	});
});

describe("readExpressionProject", () => {
	it("an old project is converted", () => {
		expect(readExpressionProject(old())!.patterns[0]!.rows[0]!.cells[0]).toEqual({
			main: 5,
			t1: 0,
			half: 0,
			t2: 0,
		});
	});
	it("an expression project is taken as it is (a 3 stays a 3)", () => {
		const expression = expressionProjectFromDrumProject(old());
		expression.patterns[0]!.rows[0]!.cells[0] = { main: 3, t1: 2, half: 0, t2: 0 };
		expect(readExpressionProject(expression)!.patterns[0]!.rows[0]!.cells[0]).toEqual({
			main: 3,
			t1: 2,
			half: 0,
			t2: 0,
		});
	});
	it("a version 1 project is upgraded, then converted", () => {
		const v1 = {
			v: 1,
			bpm: 100,
			swing: 0,
			steps: 16,
			kit: "room",
			rows: [{ voice: "kick", level: 1, mute: false, cells: [2, ...Array(15).fill(0)] }],
		};
		const p = readExpressionProject(v1)!;
		expect(p.kit).toBe("room");
		expect(p.patterns[0]!.rows[0]!.cells[0]!.main).toBe(3);
	});
	it("anything else is null", () => {
		expect(readExpressionProject(null)).toBeNull();
		expect(readExpressionProject({ v: 2, bpm: "fast" })).toBeNull();
	});
});
