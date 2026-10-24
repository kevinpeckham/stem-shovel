/**
 * What looks wrong in a chart read (docs/audio-engine.md "The chart read is
 * checked"; stem-bench Study 5): the reading model's own "Note:" lines (an
 * unreadable page, a doubt it voiced unprompted), and a key signature that
 * calls for sharps or flats while not one chord symbol carries any, the
 * signature of a PDF whose generator dropped the accidentals (a font with
 * no music glyphs). Pure: the summary text in (`readChartWithAi`'s form,
 * `m<n> key <key> … : <chords>`), short warnings out, empty when nothing
 * stands out. The check wants a signature of two or more accidentals and
 * eight or more chords: in G major a song may well never print an F♯.
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

export function chartReadWarnings(summary: string): string[] {
	const warnings: string[] = [];
	const lines = summary.split(/\r?\n/);
	for (const line of lines) {
		const note = /^note:\s*(.+)$/i.exec(line.trim());
		if (note) warnings.push(`The reader notes: ${note[1]!.trim()}`);
	}
	let sharps = 0;
	let flats = 0;
	const chords: string[] = [];
	for (const line of lines) {
		if (!/^m\d+\b/.test(line.trim())) continue;
		for (const k of line.matchAll(/\bkey\s+([A-G][♭♯b#]?)\s+(major|minor)\b/gi)) {
			const n = keySignatureSharps(`${k[1]} ${k[2]}`);
			if (n === null) continue;
			sharps = Math.max(sharps, n);
			flats = Math.max(flats, -n);
		}
		const after = /:\s*([^:]*)$/.exec(line);
		if (!after) continue;
		for (const token of after[1]!.split(/\s+/))
			if (/^[A-G]/.test(token) && token !== "N.C.") chords.push(token);
	}
	const most = Math.max(sharps, flats);
	if (most >= 2 && chords.length >= 8) {
		const withAccidental = chords.filter((c) => /(^|\/)[A-G][♭♯b#]/.test(c)).length;
		if (withAccidental === 0)
			warnings.push(
				`The chart's key signature calls for ${most} ${sharps > flats ? "sharps" : "flats"}, yet none of its ${chords.length} chord symbols carries one: the file may have lost its accidentals when it was made (a PDF without music glyphs does this). Check the chart before using this answer.`,
			);
	}
	return warnings;
}
