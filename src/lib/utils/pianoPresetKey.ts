import * as v from "valibot";
import { PianoPresetDataSchema, type PianoPresetData } from "$lib/val/PianoPresetSchema";

/**
 * A preset's settings as one comparable string, so the piano can tell which
 * slot it is sitting on: the fields in the schema's order whatever order
 * they came in, numbers to three places (the engine rounds sliders to
 * hundredths and a link may carry more).
 */
export function pianoPresetKey(data: PianoPresetData): string {
	return JSON.stringify(v.parse(PianoPresetDataSchema, data), (_k, value) =>
		typeof value === "number" ? Math.round(value * 1000) / 1000 : value,
	);
}
