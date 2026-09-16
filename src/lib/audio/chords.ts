/**
 * Chords from transcribed notes (Basic Pitch, src/lib/audio/transcribe.ts):
 * the notes sounding in each bar are weighed by duration and loudness into
 * a pitch-class profile, the lowest note gets extra weight as the likely
 * root, and the profile is matched against chord templates. Consecutive
 * bars with the same chord merge into one segment.
 */
export interface Note {
	/** Seconds. */
	start: number;
	end: number;
	/** MIDI pitch. */
	pitch: number;
	/** 0..1 */
	amplitude: number;
}

export interface ChordSegment {
	/** 1-based bar the chord starts on. */
	bar: number;
	/** Bars it lasts. */
	bars: number;
	/** Seconds. */
	start: number;
	/** "D", "Bm", "G/B", "A7", "Dsus4", or "N.C." for a bar with no notes. */
	chord: string;
	/** Match quality 0..1. */
	confidence: number;
}

/** ASCII accidentals, the way charts are typed here (F#, Bb). */
const NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

/** Chord templates as intervals from the root; the suffix is what a chart shows. */
const TEMPLATES: { suffix: string; intervals: number[] }[] = [
	{ suffix: "", intervals: [0, 4, 7] },
	{ suffix: "m", intervals: [0, 3, 7] },
	{ suffix: "7", intervals: [0, 4, 7, 10] },
	{ suffix: "maj7", intervals: [0, 4, 7, 11] },
	{ suffix: "m7", intervals: [0, 3, 7, 10] },
	{ suffix: "sus4", intervals: [0, 5, 7] },
	{ suffix: "7sus4", intervals: [0, 5, 7, 10] },
	{ suffix: "sus2", intervals: [0, 2, 7] },
	{ suffix: "dim", intervals: [0, 3, 6] },
	{ suffix: "aug", intervals: [0, 4, 8] },
	{ suffix: "5", intervals: [0, 7] },
];

/**
 * The chord a pitch-class profile (12 weights, C first) fits best. `bass` is
 * the lowest pitch class, which the root usually is, so a chord rooted there
 * gets a clear bonus; `previous` is the last bar's chord, kept when it fits
 * nearly as well (a bar of the same chord should not flicker between
 * spellings that share its notes).
 */
export function chordOf(
	profile: ArrayLike<number>,
	bass: number | null,
	previous?: string,
): { chord: string; confidence: number } {
	const total = Array.from(profile).reduce((a, b) => a + b, 0);
	if (total <= 0) return { chord: "N.C.", confidence: 0 };
	const scored: { chord: string; root: number; score: number }[] = [];
	for (let root = 0; root < 12; root++) {
		for (const t of TEMPLATES) {
			const inChord = new Set(t.intervals.map((i) => (root + i) % 12));
			let inside = 0;
			for (let pc = 0; pc < 12; pc++) if (inChord.has(pc)) inside += profile[pc];
			// Share of the profile the chord explains, less a little per tone beyond
			// a triad (a seventh must earn its place) and for the bare fifth.
			let score = inside / total - 0.03 * Math.max(0, t.intervals.length - 3);
			if (t.suffix === "5") score -= 0.04;
			if (bass !== null && bass === root) score += 0.18;
			scored.push({ chord: `${NAMES[root]}${t.suffix}`, root, score });
		}
	}
	scored.sort((a, b) => b.score - a.score);
	let best = scored[0];
	if (previous) {
		const kept = scored.find((c) => c.chord === previous);
		if (kept && kept.score >= best.score - 0.06) best = kept;
	}
	let chord = best.chord;
	if (bass !== null && bass !== best.root && best.score > 0.55) chord = `${chord}/${NAMES[bass]}`;
	const runnerUp = scored.find((c) => c.root !== best.root)?.score ?? 0;
	const confidence = Math.max(0, Math.min(1, best.score - Math.max(0, runnerUp) + 0.5));
	return { chord, confidence };
}

/**
 * One chord per bar (`barStarts` are the bars' start times in seconds, the
 * last entry the end of the analysed span), merged across equal neighbours.
 */
export function chordsPerBar(notes: Note[], barStarts: number[]): ChordSegment[] {
	const bars: ChordSegment[] = [];
	for (let b = 0; b + 1 < barStarts.length; b++) {
		const from = barStarts[b];
		const to = barStarts[b + 1];
		const profile = new Float64Array(12);
		let lowest: { pitch: number; weight: number } | null = null;
		for (const n of notes) {
			const overlap = Math.min(n.end, to) - Math.max(n.start, from);
			if (overlap <= 0) continue;
			const weight = overlap * (0.3 + n.amplitude);
			profile[((n.pitch % 12) + 12) % 12] += weight;
			if (
				n.pitch < 60 &&
				(!lowest || n.pitch < lowest.pitch || (n.pitch === lowest.pitch && weight > lowest.weight))
			) {
				lowest = { pitch: n.pitch, weight };
			}
		}
		const bass = lowest ? ((lowest.pitch % 12) + 12) % 12 : null;
		if (bass !== null) profile[bass] += lowest!.weight * 0.5;
		const previous = bars[bars.length - 1];
		const { chord, confidence } = chordOf(profile, bass, previous?.chord);
		if (previous && previous.chord === chord) previous.bars += 1;
		else bars.push({ bar: b + 1, bars: 1, start: from, chord, confidence });
	}
	return bars;
}

/** `| D | A | Bm | G |` lines, four bars each, with a chord repeated across the bars it holds. */
export function chordChart(segments: ChordSegment[], perLine = 4): string {
	const cells: string[] = [];
	for (const s of segments) for (let i = 0; i < s.bars; i++) cells.push(i === 0 ? s.chord : "%");
	const lines: string[] = [];
	for (let i = 0; i < cells.length; i += perLine) {
		lines.push(`| ${cells.slice(i, i + perLine).join(" | ")} |`);
	}
	return lines.join("\n");
}

/**
 * A bar's notes as a line a chart reader (or a model) can read: lowest to
 * highest, `D2×1.60s@0.80` = pitch and octave, seconds sounding in the bar,
 * loudness. Notes sounding under 50 ms are left out.
 */
export function describeBars(notes: Note[], barStarts: number[]): { bar: number; notes: string }[] {
	const out: { bar: number; notes: string }[] = [];
	for (let b = 0; b + 1 < barStarts.length; b++) {
		const from = barStarts[b];
		const to = barStarts[b + 1];
		const rows = notes
			.map((n) => ({ ...n, overlap: Math.min(n.end, to) - Math.max(n.start, from) }))
			.filter((n) => n.overlap > 0.05)
			.sort((a, c) => a.pitch - c.pitch)
			.map(
				(n) =>
					`${NAMES[((n.pitch % 12) + 12) % 12]}${Math.floor(n.pitch / 12) - 1}×${n.overlap.toFixed(2)}s@${n.amplitude.toFixed(2)}`,
			);
		out.push({ bar: b + 1, notes: rows.join(" ") || "(silence)" });
	}
	return out;
}
