import * as v from "valibot";
import { ChordShareSchema, type ChordShare } from "#lib/val/ChordShareSchema.js";

/**
 * The settings a chord player share link carries, or null when the string
 * is not one (a hand-edited link, a version this build does not read,
 * values out of range). The result is checked against the schema, which
 * fills in the defaults the codec left out, so nothing past the codec is
 * trusted.
 */
export function decodeChordShare(encoded: string): ChordShare | null {
	try {
		const binary = atob(encoded.replaceAll("-", "+").replaceAll("_", "/"));
		const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
		const json: unknown = JSON.parse(new TextDecoder().decode(bytes));
		const parsed = v.safeParse(ChordShareSchema, json);
		return parsed.success ? parsed.output : null;
	} catch {
		return null;
	}
}
