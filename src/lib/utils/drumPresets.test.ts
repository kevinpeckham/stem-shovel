import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";
import { DEFAULT_HUMANIZE, DRUM_METERS, drumStepsFor } from "$lib/constants/drumMachine";
import { DRUM_PRESET_STYLES, DRUM_PRESETS } from "$lib/constants/drumPresets";
import { DrumProjectSchema } from "$lib/val/DrumPatternSchema";
import { decodeDrumProject } from "./decodeDrumProject";
import { drumPresetProject } from "./drumPresetProject";
import { encodeDrumProject } from "./encodeDrumProject";

describe("the preset beats", () => {
	test("every preset is a valid project that survives a share link", () => {
		for (const preset of DRUM_PRESETS) {
			const project = drumPresetProject(preset);
			const parsed = v.safeParse(DrumProjectSchema, project);
			expect(parsed.success, preset.id).toBe(true);
			expect(decodeDrumProject(encodeDrumProject(project)), preset.id).toEqual(project);
		}
	});
	test("a preset without its own humanize gets the default, one with keeps it", () => {
		const funk = DRUM_PRESETS.find((p) => p.id === "funk")!;
		const boomBap = DRUM_PRESETS.find((p) => p.id === "boom-bap")!;
		expect(drumPresetProject(funk).humanize).toBe(DEFAULT_HUMANIZE);
		expect(drumPresetProject(boomBap).humanize).toBe(boomBap.humanize);
	});
	test("ids are unique, styles are known, meters fit their steps", () => {
		const ids = new Set(DRUM_PRESETS.map((p) => p.id));
		expect(ids.size).toBe(DRUM_PRESETS.length);
		for (const preset of DRUM_PRESETS) {
			expect(DRUM_PRESET_STYLES, preset.id).toContain(preset.style);
			const project = drumPresetProject(preset);
			for (const pattern of project.patterns) {
				expect(drumStepsFor(pattern.meter), preset.id).toContain(pattern.steps);
			}
		}
	});
	test("a row reads its characters as velocities and keeps its level and pan", () => {
		const project = drumPresetProject({
			id: "t",
			name: "t",
			style: "Rock",
			bpm: 100,
			meter: "6/8",
			patterns: [
				[
					{ voice: "kick", cells: "X.o.x.......", level: 0.5, pan: -1 },
					{ voice: "ride", cells: "............" },
				],
			],
		});
		expect(project.patterns[0]!.rows[0]!.cells.slice(0, 5)).toEqual([3, 0, 1, 0, 2]);
		expect(project.patterns[0]!.rows[0]!.level).toBe(0.5);
		expect(project.patterns[0]!.rows[0]!.pan).toBe(-1);
		expect(project.patterns[0]!.rows[1]!.level).toBe(0.5);
		expect(project.patterns[0]!.meter).toBe("6/8");
	});
	test("a malformed preset throws", () => {
		expect(() =>
			drumPresetProject({
				id: "bad",
				name: "bad",
				style: "Rock",
				bpm: 100,
				patterns: [[{ voice: "kick", cells: "X...x.." }]],
			}),
		).toThrow(/7 steps/);
		expect(() =>
			drumPresetProject({
				id: "bad",
				name: "bad",
				style: "Rock",
				bpm: 100,
				patterns: [[{ voice: "kick", cells: "X...x...X...x..?" }]],
			}),
		).toThrow(/"\?"/);
	});
});

describe("meters", () => {
	test("each meter offers a bar and two bars; 4/4 a half bar too", () => {
		expect(drumStepsFor("4/4")).toEqual([8, 16, 32]);
		expect(drumStepsFor("3/4")).toEqual([12, 24]);
		expect(drumStepsFor("6/8")).toEqual([12, 24]);
		expect(DRUM_METERS.find((m) => m.id === "6/8")!.group).toBe(6);
	});
});
