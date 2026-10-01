import { describe, expect, test } from "vite-plus/test";
import * as v from "valibot";
import { DRUM_GENERATOR_STYLES } from "$lib/constants/drumGenerator";
import {
	DRUM_BPM_MAX,
	DRUM_BPM_MIN,
	DRUM_METERS,
	MAX_DRUM_ROWS,
	drumStepsFor,
} from "$lib/constants/drumMachine";
import { DrumPatternSchema, type DrumPattern } from "$lib/val/DrumPatternSchema";
import { emptyDrumPattern } from "./emptyDrumPattern";
import { generateDrumPattern } from "./generateDrumPattern";
import { resizeDrumPattern } from "./resizeDrumPattern";
import { startingDrumProject } from "./startingDrumProject";

const rock = DRUM_GENERATOR_STYLES.find((s) => s.id === "rock")!;
const base = () => startingDrumProject().patterns[0]!;
const hits = (p: DrumPattern) => p.rows.flatMap((r) => r.cells).filter(Boolean).length;

describe("generateDrumPattern", () => {
	test("the templates are well formed: sixteen characters for 4/4, twelve for 6/8, every character known", () => {
		for (const style of DRUM_GENERATOR_STYLES) {
			if (style.bpm !== undefined) {
				expect(style.bpm, style.id).toBeGreaterThanOrEqual(DRUM_BPM_MIN);
				expect(style.bpm, style.id).toBeLessThanOrEqual(DRUM_BPM_MAX);
			}
			for (const [k, val] of Object.entries(style.fx ?? {}))
				if (k !== "delayTime" && k !== "delayAnalog")
					expect(val, `${style.id} ${k}`).toBeGreaterThanOrEqual(0);
			for (const row of style.four) {
				expect(row.hits, `${style.id} ${row.voice}`).toMatch(/^[Xxo0-9.]{16}$/);
				if (row.ghosts) expect(row.ghosts, `${style.id} ${row.voice}`).toMatch(/^[0-9.]{16}$/);
			}
			for (const row of style.six) {
				expect(row.hits, `${style.id} ${row.voice} 6/8`).toMatch(/^[Xxo0-9.]{12}$/);
				if (row.ghosts) expect(row.ghosts, `${style.id} ${row.voice} 6/8`).toMatch(/^[0-9.]{12}$/);
			}
		}
	});
	test("the same seed gives the same pattern; another seed, another pattern", () => {
		const a = generateDrumPattern(rock, 0.5, base(), 7);
		const b = generateDrumPattern(rock, 0.5, base(), 7);
		const c = generateDrumPattern(rock, 0.5, base(), 8);
		expect(b).toEqual(a);
		expect(c).not.toEqual(a);
	});
	test("the backbone is always there and density 0 leaves nothing else", () => {
		const p = generateDrumPattern(rock, 0, base(), 1);
		const kick = p.rows.find((r) => r.voice === "kick")!.cells;
		const snare = p.rows.find((r) => r.voice === "snare")!.cells;
		const hat = p.rows.find((r) => r.voice === "hat-closed")!.cells;
		expect(kick).toEqual([3, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0]);
		expect(snare).toEqual([0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0]);
		expect(hat).toEqual([2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0]);
	});
	test("more density, more hits", () => {
		const sparse = hits(generateDrumPattern(rock, 0, base(), 3));
		const middle = hits(generateDrumPattern(rock, 0.5, base(), 3));
		const busy = hits(generateDrumPattern(rock, 1, base(), 3));
		expect(middle).toBeGreaterThan(sparse);
		expect(busy).toBeGreaterThanOrEqual(middle);
	});
	test("keeps the rows' settings, silences the ones the style does not play, adds the ones it needs", () => {
		const from = base();
		from.rows[0]!.level = 0.33;
		from.rows[0]!.pan = -0.5;
		from.rows[0]!.mute = true;
		from.rows.push({
			voice: "cowbell",
			level: 0.5,
			pan: 0,
			mute: false,
			delaySend: 0,
			reverbSend: 0,
			cells: from.rows[0]!.cells.map(() => 2),
		});
		const p = generateDrumPattern(rock, 0.5, from, 5);
		const kick = p.rows[0]!;
		expect([kick.voice, kick.level, kick.pan, kick.mute]).toEqual(["kick", 0.33, -0.5, true]);
		expect(p.rows.find((r) => r.voice === "cowbell")!.cells.every((c) => c === 0)).toBe(true);
		expect(p.rows.find((r) => r.voice === "crash")).toBeDefined();
		expect(p.rows.length).toBeLessThanOrEqual(MAX_DRUM_ROWS);
	});
	test("every style in every meter and length is a valid pattern of the shape asked for", () => {
		for (const style of DRUM_GENERATOR_STYLES) {
			for (const meter of DRUM_METERS) {
				for (const steps of drumStepsFor(meter.id)) {
					const from = resizeDrumPattern({ ...emptyDrumPattern(base()), meter: meter.id }, steps);
					const p = generateDrumPattern(style, 0.7, from, 11);
					expect(
						v.safeParse(DrumPatternSchema, p).success,
						`${style.id} ${meter.id} ${steps}`,
					).toBe(true);
					expect(p.steps).toBe(steps);
					expect(p.meter).toBe(meter.id);
					for (const r of p.rows) expect(r.cells.length, `${style.id} ${r.voice}`).toBe(steps);
					expect(hits(p), `${style.id} ${meter.id} ${steps}`).toBeGreaterThan(0);
				}
			}
		}
	});
	test("a two-bar pattern draws its bars apart", () => {
		const from = resizeDrumPattern(base(), 32);
		const p = generateDrumPattern(rock, 0.5, from, 21);
		const first = p.rows.map((r) => r.cells.slice(0, 16));
		const second = p.rows.map((r) => r.cells.slice(16));
		expect(second).not.toEqual(first);
		const kick = p.rows.find((r) => r.voice === "kick")!.cells;
		expect(kick[0]).toBe(3);
		expect(kick[16]).toBe(3);
	});
});
