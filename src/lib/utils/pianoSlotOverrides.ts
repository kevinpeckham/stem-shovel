import * as v from "valibot";
import { NamedPianoPresetSchema, type NamedPianoPreset } from "$lib/val/PianoPresetSchema";

/** A signed-out player's own slot presets, per browser (docs/piano.md, "Presets"): slot number to preset. */
const KEY = "stemshovel.piano.presets";

export function loadPianoSlotOverrides(): Record<number, NamedPianoPreset> {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return {};
		const json = JSON.parse(raw) as Record<string, unknown>;
		const out: Record<number, NamedPianoPreset> = {};
		for (const [k, value] of Object.entries(json)) {
			const slot = Number(k);
			const parsed = v.safeParse(NamedPianoPresetSchema, value);
			if (Number.isInteger(slot) && parsed.success) out[slot] = parsed.output;
		}
		return out;
	} catch {
		return {};
	}
}

export function savePianoSlotOverrides(overrides: Record<number, NamedPianoPreset>): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(overrides));
	} catch {
		// Private mode or a full store: the choice lasts for this page only.
	}
}
