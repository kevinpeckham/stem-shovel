import * as v from "valibot";
import { NamedAmpPresetSchema, type NamedAmpPreset } from "#lib/val/AmpPresetSchema.js";
import type { AmpInstrument } from "#lib/val/AmpSchema.js";

/** A signed-out player's own amp slot presets, per browser and per instrument (docs/practice-amp.md, "Presets"): slot number to preset. */
const keyOf = (instrument: AmpInstrument) => `stemshovel.amp.presets.${instrument}`;

export function loadAmpSlotOverrides(instrument: AmpInstrument): Record<number, NamedAmpPreset> {
	try {
		const raw = localStorage.getItem(keyOf(instrument));
		if (!raw) return {};
		const json = JSON.parse(raw) as Record<string, unknown>;
		const out: Record<number, NamedAmpPreset> = {};
		for (const [k, value] of Object.entries(json)) {
			const slot = Number(k);
			const parsed = v.safeParse(NamedAmpPresetSchema, value);
			if (Number.isInteger(slot) && parsed.success) out[slot] = parsed.output;
		}
		return out;
	} catch {
		return {};
	}
}

export function saveAmpSlotOverrides(
	instrument: AmpInstrument,
	overrides: Record<number, NamedAmpPreset>,
): void {
	try {
		localStorage.setItem(keyOf(instrument), JSON.stringify(overrides));
	} catch {
		// Private mode or a full store: the choice lasts for this page only.
	}
}
