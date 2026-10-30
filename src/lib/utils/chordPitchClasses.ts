/**
 * The pitch classes a chord symbol names (stem-bench Study 12: the chart
 * rendered as plain pads for chroma alignment), roughly: the root (C = 0),
 * the triad its quality gives (major, m/min/−, dim/°, ø, aug/+, sus2,
 * sus4, a bare 5), the sixth, seventh and ninth its suffix asks for, the
 * altered fifths and ninths, and a slash bass. An eleventh or thirteenth
 * adds its tone; anything finer is beside the point, since chroma only
 * needs roughly the right pitch classes. Null for N.C. and for anything
 * that is not a chord symbol (a lyric such as "Chorus" or "Bed"), so the
 * chart parsers can tell a chord line from a line of words.
 */
const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** The suffix's vocabulary, longest spellings first so "maj" is never read as "m". */
const PIECES = [
	"maj",
	"Maj",
	"min",
	"dim",
	"aug",
	"sus2",
	"sus4",
	"sus",
	"add9",
	"add2",
	"add11",
	"add4",
	"6/9",
	"69",
	"13",
	"11",
	"b5",
	"#5",
	"b9",
	"#9",
	"#11",
	"b13",
	"alt",
	"M",
	"Δ",
	"m",
	"-",
	"−",
	"°",
	"ø",
	"+",
	"9",
	"7",
	"6",
	"5",
	"(",
	")",
	",",
];

/** Each suffix piece's tones above the root, applied after the triad is set. */
const ADDED: Record<string, number[]> = {
	add9: [2],
	add2: [2],
	add11: [5],
	add4: [5],
	"6/9": [9, 2],
	"69": [9, 2],
	"6": [9],
	"9": [2],
	"11": [2, 5],
	"13": [2, 9],
	b9: [1],
	"#9": [3],
	"#11": [6],
	b13: [8],
};
const SEVENTHS = new Set(["7", "9", "11", "13", "alt"]);
const MINOR = new Set(["m", "min", "-", "−"]);
const MAJOR_SEVENTH = new Set(["maj", "Maj", "M", "Δ"]);

/** The suffix cut into vocabulary pieces; null when something in it is not chord language. */
function piecesOf(suffix: string): string[] | null {
	const out: string[] = [];
	let rest = suffix;
	while (rest) {
		const piece = PIECES.find((p) => rest.startsWith(p));
		if (!piece) return null;
		out.push(piece);
		rest = rest.slice(piece.length);
	}
	return out;
}

function thirdOf(pieces: string[]): number | null {
	if (pieces.includes("sus2")) return 2;
	if (pieces.includes("sus4") || pieces.includes("sus")) return 5;
	// A bare 5 is a power chord: root and fifth.
	if (pieces.length === 1 && pieces[0] === "5") return null;
	const minor = pieces.some((p) => MINOR.has(p) || p === "dim" || p === "°" || p === "ø");
	return minor ? 3 : 4;
}

function fifthOf(pieces: string[]): number {
	if (pieces.some((p) => p === "dim" || p === "°" || p === "ø" || p === "b5")) return 6;
	if (pieces.some((p) => p === "aug" || p === "+" || p === "#5")) return 8;
	return 7;
}

function seventhOf(pieces: string[]): number | null {
	if (pieces.includes("ø")) return 10;
	const major = pieces.some((p) => MAJOR_SEVENTH.has(p));
	// "Δ" alone is a major seventh chord; "maj" alone is just major.
	if (!pieces.some((p) => SEVENTHS.has(p))) return pieces.includes("Δ") ? 11 : null;
	if (major) return 11;
	return pieces.includes("dim") || pieces.includes("°") ? 9 : 10;
}

function rootOf(letter: string, accidental: string): number {
	const pc = LETTER_PC[letter]!;
	if (accidental === "#") return (pc + 1) % 12;
	if (accidental === "b") return (pc + 11) % 12;
	return pc;
}

export function chordPitchClasses(symbol: string): { root: number; tones: number[] } | null {
	const token = symbol.trim().replace(/♯/g, "#").replace(/♭/g, "b");
	// A slash followed by a note is a bass; "6/9" keeps its slash.
	const slash = /^(.*)\/([A-G])([#b]?)$/.exec(token);
	const body = slash ? slash[1]! : token;
	const m = /^([A-G])([#b]?)(.*)$/.exec(body);
	if (!m) return null;
	const pieces = piecesOf(m[3]!);
	if (!pieces) return null;
	const root = rootOf(m[1]!, m[2]!);
	const intervals = [0, thirdOf(pieces), fifthOf(pieces), seventhOf(pieces)];
	for (const p of pieces) intervals.push(...(ADDED[p] ?? []));
	const tones: number[] = [];
	for (const i of intervals) {
		if (i === null) continue;
		const pc = (root + i) % 12;
		if (!tones.includes(pc)) tones.push(pc);
	}
	if (slash) {
		const bass = rootOf(slash[2]!, slash[3]!);
		if (!tones.includes(bass)) tones.push(bass);
	}
	return { root, tones };
}
