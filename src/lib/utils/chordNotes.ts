import type { ChordQuality, ChordVoicing, SeventhType } from "$lib/constants/circleOfFifths";

/**
 * A chord as MIDI notes for the piano engine (docs/chord-player.md): the
 * triad from its root pitch class and quality, the seventh when asked
 * for, laid out by the voicing, after the chord player's enhancer. The
 * root's octave is `octave` (4 = middle C's); notes are ascending and
 * never repeat a pitch.
 */
const TRIADS: Record<ChordQuality, [number, number, number]> = {
	major: [0, 4, 7],
	minor: [0, 3, 7],
	diminished: [0, 3, 6],
};

/** MIDI note of a pitch class (0 = C) in an octave (4 = middle C's). */
export function noteMidi(pitch: number, octave: number): number {
	return 12 * (octave + 1) + pitch;
}

export interface ChordSpec {
	pitch: number;
	quality: ChordQuality;
	/** Null for the triad; a major chord takes the dominant or major seventh, a minor or diminished chord the minor seventh. */
	seventh: SeventhType | null;
	voicing: ChordVoicing;
	octave?: number;
}

export function chordMidi({ pitch, quality, seventh, voicing, octave = 4 }: ChordSpec): number[] {
	const intervals: number[] = [...TRIADS[quality]];
	if (seventh) intervals.push(quality === "major" && seventh === "major7" ? 11 : 10);
	return voiceChord({ pitch, intervals, voicing, octave });
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
}: {
	pitch: number;
	intervals: number[];
	voicing: ChordVoicing;
	octave?: number;
}): number[] {
	const root = noteMidi(pitch, octave);
	const [, third = 4, fifth = 7] = intervals;
	const triad = [root, root + third, root + fifth];
	let notes: number[];
	switch (voicing) {
		case "spread":
			notes = [root - 12, root + third, root + fifth + 12];
			break;
		case "rich":
			notes = [root - 24, root - 12, root + third, root + fifth, root + 12];
			break;
		case "bass":
			notes = [root - 24, ...triad];
			break;
		case "rootBass":
			notes = [root - 12, root + third, root + fifth, root + 12];
			break;
		default:
			notes = triad;
	}
	for (const semitones of intervals.slice(3)) notes.push(root + semitones);
	return [...new Set(notes)].filter((n) => n >= 0 && n <= 127).sort((a, b) => a - b);
}

/** The chord's name: "C", "Am", "B°", with "7", "maj7" or "m7" for a seventh. */
export function chordName(label: string, quality: ChordQuality, seventh: SeventhType | null) {
	if (!seventh) return label;
	if (quality === "major") return seventh === "major7" ? `${label}maj7` : `${label}7`;
	if (quality === "minor") return `${label}7`;
	return `${label}7`;
}
