import {
	DRUM_BPM_MIN,
	DRUM_KIT_IDS,
	DRUM_PATTERN_VERSION,
	DRUM_STEP_CHOICES,
	DRUM_VOICE_IDS,
} from "$lib/constants/drumMachine";
import type { DrumProject } from "$lib/val/DrumPatternSchema";
import { BitWriter } from "./bitWriter";

/**
 * A project as the string a share link carries (docs/drum-machine.md):
 * bits, base64url. Version 2 is a version byte, then the tempo above the
 * minimum (8 bits), swing and humanize in hundredths (7 each), the kit
 * (2), the pattern count less one (3), and for each pattern its steps
 * choice (2) and row count (4), and for each row its voice (4), level in
 * hundredths (7), pan in hundredths from -1 (8), mute (1) and a velocity
 * per step (2 each). One 16-step pattern of eight rows is 76 characters;
 * eight patterns of 32 steps with nine rows, about a thousand. The version byte is what lets a
 * later format add a field while these links keep opening.
 */
export function encodeDrumProject(p: DrumProject): string {
	const w = new BitWriter();
	w.write(DRUM_PATTERN_VERSION, 8);
	w.write(p.bpm - DRUM_BPM_MIN, 8);
	w.write(Math.round(p.swing * 100), 7);
	w.write(Math.round(p.humanize * 100), 7);
	w.write(DRUM_KIT_IDS.indexOf(p.kit), 2);
	w.write(p.patterns.length - 1, 3);
	for (const pattern of p.patterns) {
		w.write(DRUM_STEP_CHOICES.indexOf(pattern.steps), 2);
		w.write(pattern.rows.length, 4);
		for (const r of pattern.rows) {
			w.write(DRUM_VOICE_IDS.indexOf(r.voice), 4);
			w.write(Math.round(r.level * 100), 7);
			w.write(Math.round((r.pan + 1) * 100), 8);
			w.write(r.mute ? 1 : 0, 1);
			for (let i = 0; i < pattern.steps; i++) w.write(r.cells[i] ?? 0, 2);
		}
	}
	const bytes = w.bytes();
	let binary = "";
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
