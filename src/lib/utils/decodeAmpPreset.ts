import * as v from "valibot";
import { NamedAmpPresetSchema, type NamedAmpPreset } from "#lib/val/AmpPresetSchema.js";

/** The amp preset a share link carries, or null for anything that is not one (encodeAmpPreset is the other half). */
export function decodeAmpPreset(encoded: string): NamedAmpPreset | null {
	try {
		const b64 = encoded.replaceAll("-", "+").replaceAll("_", "/");
		const binary = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
		const json = new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
		const parsed = v.safeParse(NamedAmpPresetSchema, JSON.parse(json));
		return parsed.success ? parsed.output : null;
	} catch {
		return null;
	}
}
