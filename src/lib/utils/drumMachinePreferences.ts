import * as v from "valibot";
import {
	DrumProjectSchema,
	DrumProjectV1Schema,
	type DrumProject,
} from "#lib/val/DrumPatternSchema.js";
import { upgradeDrumProject } from "./upgradeDrumProject";
import { tempoRatioOf, type TempoRatio } from "#lib/constants/tempo.js";

/** The project the drum machine last had, remembered per browser; a version 1 one is upgraded on read. */
const KEY = "stemshovel.drum-machine";

export function loadDrumMachinePreferences(): DrumProject | null {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return null;
		const json: unknown = JSON.parse(raw);
		const current = v.safeParse(DrumProjectSchema, json);
		if (current.success) return current.output;
		const old = v.safeParse(DrumProjectV1Schema, json);
		return old.success ? upgradeDrumProject(old.output) : null;
	} catch {
		return null;
	}
}

export function saveDrumMachinePreferences(p: DrumProject): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(p));
	} catch {
		// Private mode or a full store: the project lasts for this page only.
	}
}

/** Whether the drums follow the session tempo and at what ratio (docs/audio-engine.md, "One tempo for the page"), a choice per browser. */
const TEMPO_KEY = "stemshovel.drum-machine.tempo";
export function loadDrumTempoFollow(): { follow: boolean; ratio: TempoRatio } {
	try {
		const raw = localStorage.getItem(TEMPO_KEY);
		const json: unknown = raw ? JSON.parse(raw) : null;
		const o = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
		return { follow: o.follow !== false, ratio: tempoRatioOf(o.ratio) ?? 1 };
	} catch {
		return { follow: true, ratio: 1 };
	}
}
export function saveDrumTempoFollow(v: { follow: boolean; ratio: TempoRatio }): void {
	try {
		localStorage.setItem(TEMPO_KEY, JSON.stringify(v));
	} catch {
		// Private mode or a full store: the choice lasts for this page only.
	}
}

/** The drum machine's master volume, a listening choice per browser, not part of the beat (docs/drum-machine.md, "Master volume"). */
const VOLUME_KEY = "stemshovel.drum-machine.volume";
export function loadDrumVolume(): number {
	try {
		const v = Number(localStorage.getItem(VOLUME_KEY));
		return Number.isFinite(v) && localStorage.getItem(VOLUME_KEY) !== null
			? Math.min(1, Math.max(0, v))
			: 1;
	} catch {
		return 1;
	}
}
export function saveDrumVolume(v: number): void {
	try {
		localStorage.setItem(VOLUME_KEY, String(v));
	} catch {
		// Private mode or a full store: the choice lasts for this page only.
	}
}
