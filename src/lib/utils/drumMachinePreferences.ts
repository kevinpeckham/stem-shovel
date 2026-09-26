import * as v from "valibot";
import {
	DrumProjectSchema,
	DrumProjectV1Schema,
	type DrumProject,
} from "$lib/val/DrumPatternSchema";
import { upgradeDrumProject } from "./upgradeDrumProject";

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
