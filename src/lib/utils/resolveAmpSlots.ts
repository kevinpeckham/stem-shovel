import {
	AMP_PRESET_SLOTS,
	type AmpPresetData,
	type NamedAmpPreset,
} from "#lib/val/AmpPresetSchema.js";
import type { AmpInstrument } from "#lib/val/AmpSchema.js";

/** What a slot button holds and where it came from (docs/practice-amp.md, "Presets"). */
export interface AmpSlot extends NamedAmpPreset {
	source: "site" | "browser" | "account";
	/** The account preset's id, for the account's own. */
	id?: string;
}

/**
 * The six slot buttons of one instrument, resolved in layers: the
 * account's slotted presets of that instrument for a signed-in member,
 * else the browser's own overrides, and the site's defaults under both;
 * an empty slot is null.
 */
export function resolveAmpSlots(
	instrument: AmpInstrument,
	site: (NamedAmpPreset | null)[],
	browser: Record<number, NamedAmpPreset>,
	account:
		| {
				id: string;
				name: string;
				instrument: AmpInstrument;
				slot: number | null;
				data: AmpPresetData;
		  }[]
		| null,
): (AmpSlot | null)[] {
	return Array.from({ length: AMP_PRESET_SLOTS }, (_, i) => {
		const slot = i + 1;
		const own = account?.find((p) => p.instrument === instrument && p.slot === slot);
		if (own) return { id: own.id, name: own.name, data: own.data, source: "account" };
		const mine = account ? null : browser[slot];
		if (mine) return { ...mine, source: "browser" };
		const s = site[i];
		return s ? { ...s, source: "site" } : null;
	});
}
