import {
	PIANO_PRESET_SLOTS,
	type NamedPianoPreset,
	type PresetInstrument,
} from "$lib/val/PianoPresetSchema";

/** What a slot button holds and where it came from (docs/piano.md, "Presets"). */
export interface PianoSlot extends NamedPianoPreset {
	source: "site" | "browser" | "account";
	/** The account preset's id, for the account's own. */
	id?: string;
}

/**
 * The five slot buttons, resolved in layers: the account's slotted presets
 * for a signed-in member, else the browser's own overrides, and the site's
 * defaults (a system admin's) under both; an empty slot is null.
 */
export function resolvePianoSlots(
	site: (NamedPianoPreset | null)[],
	browser: Record<number, NamedPianoPreset>,
	account:
		| {
				id: string;
				name: string;
				slot: number | null;
				chordSlot?: number | null;
				data: NamedPianoPreset["data"];
		  }[]
		| null,
	instrument: PresetInstrument = "piano",
): (PianoSlot | null)[] {
	return Array.from({ length: PIANO_PRESET_SLOTS }, (_, i) => {
		const slot = i + 1;
		const own = account?.find(
			(p) => (instrument === "chords" ? (p.chordSlot ?? null) : p.slot) === slot,
		);
		if (own) return { id: own.id, name: own.name, data: own.data, source: "account" };
		const mine = account ? null : browser[slot];
		if (mine) return { ...mine, source: "browser" };
		const s = site[i];
		return s ? { ...s, source: "site" } : null;
	});
}
