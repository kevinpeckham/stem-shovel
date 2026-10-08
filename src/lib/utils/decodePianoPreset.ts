import * as v from "valibot";
import { NamedPianoPresetSchema, type NamedPianoPreset } from "#lib/val/PianoPresetSchema.js";

/** The preset a share link carries, or null for anything that is not one (encodePianoPreset is the other half). */
export function decodePianoPreset(encoded: string): NamedPianoPreset | null {
	try {
		const b64 = encoded.replaceAll("-", "+").replaceAll("_", "/");
		const binary = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
		const json = new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
		const parsed = v.safeParse(NamedPianoPresetSchema, JSON.parse(json));
		return parsed.success ? parsed.output : null;
	} catch {
		return null;
	}
}
