import type { NamedAmpPreset } from "#lib/val/AmpPresetSchema.js";

/**
 * An amp preset as the string a share link carries
 * (`#amp=…` on the page it was copied from): the name and the rig as JSON, base64url, as
 * the piano's links are made (encodePianoPreset). The schema checks it on
 * the way back in (decodeAmpPreset).
 */
export function encodeAmpPreset(preset: NamedAmpPreset): string {
	const json = JSON.stringify({ name: preset.name, data: preset.data });
	const bytes = new TextEncoder().encode(json);
	let binary = "";
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
