import { SCALE_MODES, type PianoKey } from "#lib/constants/scales.js";

/**
 * A key's notes on the keyboard: which pitch classes are in the scale, and
 * the degree (1 to 7, or 1 to 5 and 6 for the pentatonics and blues) of
 * each, so the keys can be lit and numbered. `degreeOf` is null off the
 * scale.
 */
export function scalePitchClasses(key: PianoKey): Set<number> {
	const mode = SCALE_MODES.find((m) => m.id === key.mode) ?? SCALE_MODES[0];
	return new Set(mode.intervals.map((i) => (key.root + i) % 12));
}

export function degreeOf(pitchClass: number, key: PianoKey): number | null {
	const mode = SCALE_MODES.find((m) => m.id === key.mode) ?? SCALE_MODES[0];
	const i = (mode.intervals as readonly number[]).indexOf(
		(((pitchClass - key.root) % 12) + 12) % 12,
	);
	return i < 0 ? null : i + 1;
}
