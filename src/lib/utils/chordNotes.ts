import type { ChordVoicing } from "#lib/constants/circleOfFifths.js";

/** MIDI note of a pitch class (0 = C) in an octave (4 = middle C's). */
export function noteMidi(pitch: number, octave: number): number {
	return 12 * (octave + 1) + pitch;
}

/**
 * Any chord by its intervals (semitones above the root, the triad first,
 * then the seventh and extensions), laid out by the voicing: the voicing
 * moves the triad's root, third and fifth as before and everything above
 * the triad stays where the recipe put it (a ninth a ninth up).
 */
export function voiceChord({
	pitch,
	intervals,
	voicing,
	octave = 4,
	inversion = 0,
}: {
	pitch: number;
	intervals: number[];
	voicing: ChordVoicing;
	octave?: number;
	/** 0 root position; 1 the third at the bottom; 2 the fifth (the lowest triad notes go up an octave). */
	inversion?: number;
}): number[] {
	const root = noteMidi(pitch, octave);
	const [, third = 4, fifth = 7] = intervals;
	const triad = [root, root + third, root + fifth];
	for (let i = 0; i < Math.min(2, Math.max(0, inversion)); i++) triad[i] += 12;
	triad.sort((a, b) => a - b);
	let notes: number[];
	// The voicings place the triad's three notes; an inversion has already turned them.
	const [low, mid, high] = triad;
	switch (voicing) {
		case "spread":
			notes = [low - 12, mid, high + 12];
			break;
		case "rich":
			notes = [low - 24, low - 12, mid, high, low + 12];
			break;
		case "bass":
			notes = [low - 24, ...triad];
			break;
		case "rootBass":
			notes = [low - 12, mid, high, low + 12];
			break;
		default:
			notes = triad;
	}
	for (const semitones of intervals.slice(3)) notes.push(root + semitones);
	return [...new Set(notes)].filter((n) => n >= 0 && n <= 127).sort((a, b) => a - b);
}
