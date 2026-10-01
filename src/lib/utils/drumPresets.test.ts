import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";
import {
	DEFAULT_HUMANIZE,
	DRUM_METERS,
	drumStepsFor,
	DEFAULT_DRUM_SENDS,
} from "$lib/constants/drumMachine";
import { startingDrumProject } from "./startingDrumProject";
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

describe("effect defaults", () => {
	test("a new project starts with both master levels at zero and every drum sending a little", () => {
		const p = startingDrumProject();
		expect(p.fx.delayReturn).toBe(0);
		expect(p.fx.reverbReturn).toBe(0);
		for (const r of p.patterns[0]!.rows)
			expect(r.delaySend + r.reverbSend, r.voice).toBeGreaterThan(0);
		expect(p.patterns[0]!.rows.find((r) => r.voice === "snare")!.reverbSend).toBe(
			DEFAULT_DRUM_SENDS.snare.reverbSend,
		);
	});
	test("a preset row without its own sends gets its drum's defaults", () => {
		const funk = drumPresetProject(DRUM_PRESETS.find((p) => p.id === "funk")!);
		const snare = funk.patterns[0]!.rows.find((r) => r.voice === "snare")!;
		expect(snare.reverbSend).toBe(DEFAULT_DRUM_SENDS.snare.reverbSend);
	});
});

describe("preset effects", () => {
	test("every preset names its effects, loading as a valid project with at least a room or an echo", () => {
		for (const preset of DRUM_PRESETS) {
			expect(preset.fx, preset.id).toBeDefined();
			const p = drumPresetProject(preset);
			expect(v.safeParse(DrumProjectSchema, p).success, preset.id).toBe(true);
			expect(p.fx.reverbReturn + p.fx.delayReturn, preset.id).toBeGreaterThan(0);
			expect(p.fx.reverbReturn, preset.id).toBeLessThanOrEqual(0.5);
			expect(p.fx.delayReturn, preset.id).toBeLessThanOrEqual(0.4);
		}
	});
});
