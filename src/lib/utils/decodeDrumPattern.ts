import * as v from "valibot";
import {
	DRUM_BPM_MIN,
	DRUM_KIT_IDS,
	DRUM_PATTERN_VERSION,
	DRUM_STEP_CHOICES,
	DRUM_VOICE_IDS,
} from "$lib/constants/drumMachine";
import { DrumPatternSchema, type DrumPattern } from "$lib/val/DrumPatternSchema";
import { BitReader } from "./bitReader";

/**
 * The pattern a share link carries, or null when the string is not one
 * (a hand-edited link, a version this build does not read, values out of
 * range). The inverse of encodeDrumPattern; the result is checked against
 * the schema so nothing past the codec is trusted.
 */
export function decodeDrumPattern(encoded: string): DrumPattern | null {
	try {
		const b64 = encoded.replaceAll("-", "+").replaceAll("_", "/");
		const binary = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
		const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
		const r = new BitReader(bytes);
		if (r.read(8) !== DRUM_PATTERN_VERSION) return null;
		const bpm = r.read(8) + DRUM_BPM_MIN;
		const swing = r.read(7) / 100;
		const steps = DRUM_STEP_CHOICES[r.read(2)];
		const kit = DRUM_KIT_IDS[r.read(2)];
		const count = r.read(4);
		if (!steps || !kit) return null;
		const rows = [];
		for (let n = 0; n < count; n++) {
			const voice = DRUM_VOICE_IDS[r.read(4)];
			const level = r.read(7) / 100;
			const mute = r.read(1) === 1;
			const cells = [];
			for (let i = 0; i < steps; i++) cells.push(r.read(2));
			if (!voice) return null;
			rows.push({ voice, level, mute, cells });
		}
		const parsed = v.safeParse(DrumPatternSchema, { v: 1, bpm, swing, steps, kit, rows });
		return parsed.success ? parsed.output : null;
	} catch {
		return null;
	}
}
