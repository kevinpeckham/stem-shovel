import * as v from "valibot";
import { AmpPresetDataSchema, type AmpPresetData } from "#lib/val/AmpPresetSchema.js";

/**
 * A rig as one comparable string, so the amp can tell which slot it is
 * sitting on: the fields in the schema's order whatever order they came
 * in, numbers to three places, and the master left out (it is the room's
 * level, not the sound's: a preset loads without touching it).
 */
export function ampPresetKey(data: AmpPresetData): string {
	const parsed = v.parse(AmpPresetDataSchema, data);
	return JSON.stringify({ ...parsed, head: { ...parsed.head, master: 0 } }, (_k, value) =>
		typeof value === "number" ? Math.round(value * 1000) / 1000 : value,
	);
}
