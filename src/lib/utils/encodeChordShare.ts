import * as v from "valibot";
import { ChordShareSchema, type ChordShare } from "$lib/val/ChordShareSchema";

/**
 * A chord player's settings as the string a share link carries
 * (docs/chord-player.md, "Share links"): the settings with every value
 * that is the schema's default left out, as JSON, base64url. A plain
 * setup is three hundred characters or so (the chord settings always go
 * in full); one with effects up, a few hundred more.
 * `decodeChordShare` puts the defaults back.
 */
export function encodeChordShare(share: ChordShare): string {
	const defaults = v.parse(ChordShareSchema, { v: 1, chords: share.chords });
	const slim = stripDefaults(share, { ...defaults, chords: {} }) as Record<string, unknown>;
	slim.v = 1;
	const bytes = new TextEncoder().encode(JSON.stringify(slim));
	let binary = "";
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** The value with every field equal to its default removed, nested objects too; an object left empty goes as well. */
function stripDefaults(value: unknown, defaults: unknown): unknown {
	if (!value || typeof value !== "object" || Array.isArray(value)) return value;
	if (!defaults || typeof defaults !== "object") return value;
	const out: Record<string, unknown> = {};
	for (const [k, val] of Object.entries(value)) {
		const def = (defaults as Record<string, unknown>)[k];
		if (val && typeof val === "object" && !Array.isArray(val)) {
			const inner = stripDefaults(val, def);
			if (inner && typeof inner === "object" && Object.keys(inner).length === 0) continue;
			out[k] = inner;
		} else if (JSON.stringify(val) !== JSON.stringify(def)) out[k] = val;
	}
	return out;
}
