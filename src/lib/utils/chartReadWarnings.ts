/**
 * What looks wrong in a chart read (docs/audio-engine.md "The chart read is
 * checked"; stem-bench Study 5): the reading model's own "Note:" lines (an
 * unreadable page, a doubt it voiced unprompted), and a key signature that
 * calls for sharps or flats while not one chord symbol carries any, the
 * signature of a PDF whose generator dropped the accidentals (a font with
 * no music glyphs). Pure: the summary text in (`readChartWithAi`'s form,
 * `m<n> key <key> … : <chords>`), short warnings out, empty when nothing
 * stands out.
 *
 * The accidentals check judges each chord against the key IN FORCE at its
 * measure (the latest `key <K> major|minor` at or before the line; a
 * line's own mark applies to its chords). A chord is suspicious when that
 * key has two or more accidentals, the chord's root is one of the letters
 * the key alters (the first n of F C G D A E B for sharps, of B E A D G C F
 * for flats) and the root carries none; a slash bass is not judged. The
 * warning wants two or more suspicious chords, eight or more chords in all
 * and not one accidental anywhere (root or bass). stem-bench Study 6
 * (2026-10-28) measured it on 148 saved reads: the same 10 of 10
 * detectable corrupted reads as the pooled-signature rule it replaces,
 * with 1 false alarm in 42 clean reads instead of 4 (honest D-major
 * charts of natural chords, and modulating charts, no longer trip it; the
 * one left was a read that placed its modulation bars late). The wording
 * names both causes, since the flag earned trust as either.
 */
const SHARPS_OF_MAJOR: Record<string, number> = {
	C: 0,
	G: 1,
	D: 2,
	A: 3,
	E: 4,
	B: 5,
	"F♯": 6,
	"C♯": 7,
	F: -1,
	"B♭": -2,
	"E♭": -3,
	"A♭": -4,
	"D♭": -5,
	"G♭": -6,
	"C♭": -7,
};
const SHARPS_OF_MINOR: Record<string, number> = {
	A: 0,
	E: 1,
	B: 2,
	"F♯": 3,
	"C♯": 4,
	"G♯": 5,
	"D♯": 6,
	"A♯": 7,
	D: -1,
	G: -2,
	C: -3,
	F: -4,
	"B♭": -5,
	"E♭": -6,
	"A♭": -7,
};
const normalizeRoot = (root: string) => root.replace("b", "♭").replace("#", "♯");

/** The signature's count of sharps (positive) or flats (negative) for a key such as "A♭ major" or "F# minor"; null when unknown. */
export function keySignatureSharps(key: string): number | null {
	const m = /^([A-G][♭♯b#]?)\s+(major|minor)$/i.exec(key.trim());
	if (!m) return null;
	const root = normalizeRoot(m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1));
	const table = m[2]!.toLowerCase() === "minor" ? SHARPS_OF_MINOR : SHARPS_OF_MAJOR;
	return table[root] ?? null;
}

const SHARP_ORDER = "FCGDAEB";
const FLAT_ORDER = "BEADGCF";

/** The letters a signature alters: the first n of F C G D A E B for n sharps, of B E A D G C F for n flats. */
function alteredLetters(sharps: number): string {
	return sharps >= 0 ? SHARP_ORDER.slice(0, sharps) : FLAT_ORDER.slice(0, -sharps);
}

const KEY_MARK = /\bkey\s+([A-G][♭♯b#]?)\s+(major|minor)\b/gi;

/** The last known key signature a measure line marks, or null when it marks none. */
function lineSignature(line: string): number | null {
	let found: number | null = null;
	for (const k of line.matchAll(KEY_MARK)) found = keySignatureSharps(`${k[1]} ${k[2]}`) ?? found;
	return found;
}

/** The chord symbols after a measure line's last colon (N.C. left out). */
function lineChords(line: string): string[] {
	const after = /:\s*([^:]*)$/.exec(line);
	if (!after) return [];
	return after[1]!.split(/\s+/).filter((t) => /^[A-G]/.test(t) && t !== "N.C.");
}

/** A chord rooted on a letter the key in force alters, printed without an accidental. */
function isSuspicious(chord: string, sharps: number): boolean {
	if (Math.abs(sharps) < 2) return false;
	return alteredLetters(sharps).includes(chord.charAt(0)) && !/^[A-G][♭♯b#]/.test(chord);
}

/** The chords and how many of them look suspicious against the key in force at their measure. */
function scanChords(lines: string[]): { chords: string[]; suspicious: number } {
	let inForce = 0;
	let suspicious = 0;
	const chords: string[] = [];
	for (const line of lines) {
		if (!/^m\d+\b/.test(line.trim())) continue;
		inForce = lineSignature(line) ?? inForce;
		for (const chord of lineChords(line)) {
			chords.push(chord);
			if (isSuspicious(chord, inForce)) suspicious++;
		}
	}
	return { chords, suspicious };
}

export function chartReadWarnings(summary: string): string[] {
	const lines = summary.split(/\r?\n/);
	const warnings: string[] = [];
	for (const line of lines) {
		const note = /^note:\s*(.+)$/i.exec(line.trim());
		if (note) warnings.push(`The reader notes: ${note[1]!.trim()}`);
	}
	const { chords, suspicious } = scanChords(lines);
	const anyAccidental = chords.some((c) => /(^|\/)[A-G][♭♯b#]/.test(c));
	if (chords.length >= 8 && suspicious >= 2 && !anyAccidental)
		warnings.push(
			`The chart's key signature calls for sharps or flats, yet none of its ${chords.length} chord symbols carries one where the key would: the file may have lost its accidentals when it was made (a PDF without music glyphs does this), or the reader misread them. Check the chart before using this answer.`,
		);
	return warnings;
}
