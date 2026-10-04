import * as v from "valibot";
import { ChordPresetSettingsSchema, PianoPresetDataSchema } from "./PianoPresetSchema";

/**
 * What a chord player share link carries (docs/chord-player.md, "Share
 * links"): the sound and effects (a piano preset's data), the chord
 * player's own settings (a chord preset's), the circle's look and key, and
 * the session tempo. Every part but the chord settings is optional with
 * the engine's defaults, and the codec drops defaults, so a link is short
 * and one from an older build still opens.
 */
export const ChordShareUiSchema = v.object({
	keyCenter: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(11)), 0),
	keyAtTop: v.optional(v.boolean(), false),
	layout: v.optional(v.picklist(["arch", "circle"]), "arch"),
	keyMap: v.optional(v.picklist(["degree", "circle"]), "degree"),
	showKeys: v.optional(v.boolean(), false),
	showSignatures: v.optional(v.boolean(), false),
	showNumerals: v.optional(v.boolean(), false),
	highlightKey: v.optional(v.boolean(), true),
	noteReadout: v.optional(v.picklist(["both", "names", "staff", "off"]), "both"),
});
export type ChordShareUi = v.InferOutput<typeof ChordShareUiSchema>;

export const ChordShareSchema = v.object({
	v: v.literal(1),
	piano: v.optional(PianoPresetDataSchema, () => v.parse(PianoPresetDataSchema, {})),
	chords: ChordPresetSettingsSchema,
	ui: v.optional(ChordShareUiSchema, () => v.parse(ChordShareUiSchema, {})),
	bpm: v.optional(v.pipe(v.number(), v.integer(), v.minValue(30), v.maxValue(300))),
});
export type ChordShare = v.InferOutput<typeof ChordShareSchema>;
