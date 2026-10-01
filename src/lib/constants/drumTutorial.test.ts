import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";
import { DrumProjectSchema, type DrumProject } from "$lib/val/DrumPatternSchema";
import { DEFAULT_DRUM_FX, DEFAULT_DRUM_SENDS } from "./drumMachine";
import { TUTORIAL_PROJECT, TUTORIAL_STEPS, cellsSatisfied } from "./drumTutorial";

/** Every step's cells applied to the project, the way "Do it for me" does. */
function follow(project: DrumProject, upTo: number): DrumProject {
	const p = structuredClone(project);
	for (const step of TUTORIAL_STEPS.slice(0, upTo + 1)) {
		if (step.control === "copy" && p.patterns.length < 2)
			p.patterns.push(structuredClone(p.patterns[0]!));
		if (step.control === "humanize") p.humanize = 0.15;
		if (step.control === "reverb") p.fx.reverbReturn = 0.3;
		if (step.control === "delay") p.fx.delayReturn = 0.25;
		for (const w of step.cells ?? []) {
			const row = p.patterns[w.pattern ?? 0]!.rows.find((r) => r.voice === w.voice)!;
			for (const s of w.steps) row.cells[s] = w.velocity;
		}
	}
	return p;
}

describe("the rock beat tutorial", () => {
	test("starts from a valid, empty project with every effect at its default", () => {
		expect(v.safeParse(DrumProjectSchema, TUTORIAL_PROJECT).success).toBe(true);
		expect(TUTORIAL_PROJECT.fx).toEqual(DEFAULT_DRUM_FX);
		for (const r of TUTORIAL_PROJECT.patterns[0]!.rows)
			expect({ delaySend: r.delaySend, reverbSend: r.reverbSend }).toEqual(
				DEFAULT_DRUM_SENDS[r.voice],
			);
		expect(TUTORIAL_PROJECT.patterns[0]!.rows.every((r) => r.cells.every((c) => c === 0))).toBe(
			true,
		);
	});
	test("no step is done before its change, every step is done after it", () => {
		const seen = { played: true };
		TUTORIAL_STEPS.forEach((step, i) => {
			const before = follow(TUTORIAL_PROJECT, i - 1);
			const after = follow(TUTORIAL_PROJECT, i);
			if (step.cells || ["copy", "humanize", "reverb", "delay"].includes(step.control ?? "")) {
				expect(step.done(before, seen), `${step.id} before`).toBe(false);
			}
			expect(step.done(after, seen), `${step.id} after`).toBe(true);
		});
	});
	test("the play step waits for Play", () => {
		const play = TUTORIAL_STEPS.find((s) => s.control === "play")!;
		expect(play.done(TUTORIAL_PROJECT, { played: false })).toBe(false);
		expect(play.done(TUTORIAL_PROJECT, { played: true })).toBe(true);
	});
	test("the finished beat is the rock beat: kicks, backbeat accents, hats, an open hat, a crash and a fill", () => {
		const p = follow(TUTORIAL_PROJECT, TUTORIAL_STEPS.length - 1);
		expect(cellsSatisfied(p, [{ voice: "kick", steps: [0, 8, 10], velocity: 2 }])).toBe(true);
		expect(cellsSatisfied(p, [{ voice: "snare", steps: [4, 12], velocity: 3 }])).toBe(true);
		expect(cellsSatisfied(p, [{ voice: "hat-closed", steps: [14], velocity: 0 }])).toBe(true);
		expect(cellsSatisfied(p, [{ voice: "hat-open", steps: [14], velocity: 2 }])).toBe(true);
		expect(p.patterns).toHaveLength(2);
		expect(p.fx.reverbReturn).toBeGreaterThan(0);
		expect(p.fx.delayReturn).toBeGreaterThan(0);
		expect(
			cellsSatisfied(p, [{ voice: "snare", steps: [12, 13, 14, 15], velocity: 2, pattern: 1 }]),
		).toBe(true);
		expect(v.safeParse(DrumProjectSchema, p).success).toBe(true);
	});
});
