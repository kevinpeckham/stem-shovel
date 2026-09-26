import * as v from "valibot";
import { DrumPatternSchema, type DrumPattern } from "$lib/val/DrumPatternSchema";

/** The pattern the drum machine page last had, remembered per browser. */
const KEY = "stemshovel.drum-machine";

export function loadDrumMachinePreferences(): DrumPattern | null {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return null;
		const parsed = v.safeParse(DrumPatternSchema, JSON.parse(raw));
		return parsed.success ? parsed.output : null;
	} catch {
		return null;
	}
}

export function saveDrumMachinePreferences(p: DrumPattern): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(p));
	} catch {
		// Private mode or a full store: the pattern lasts for this page only.
	}
}
