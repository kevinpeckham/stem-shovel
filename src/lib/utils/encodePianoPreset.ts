import type { NamedPianoPreset } from "$lib/val/PianoPresetSchema";

/**
 * A preset as the string a share link carries (`/piano#preset=…`): the
 * name and the data as JSON, base64url. A few hundred characters; the
 * schema checks it on the way back in (decodePianoPreset).
 */
export function encodePianoPreset(preset: NamedPianoPreset): string {
	const json = JSON.stringify({ name: preset.name, data: preset.data });
	const bytes = new TextEncoder().encode(json);
	let binary = "";
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
