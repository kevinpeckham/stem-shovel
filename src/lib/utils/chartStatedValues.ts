/**
 * The tempo and time signature a chart states, read from its text with no
 * model in the loop (stem-bench Study 7, 2026-10-28: both are
 * machine-readable, and the model echoes the song's settings in their
 * place). A score summary (`musicXmlSummary`, `readChartWithAi`:
 * `m<n> key <key> <d>/<d> tempo <bpm> …: <chords>`) gives its `tempo <bpm>`
 * marks in measure order and the first time signature on a measure line;
 * a band's own chart (markdown) gives "120 bpm", "bpm 120" or "♩ = 120" and
 * a standalone `<d>/<d>` (whitespace, a line edge, a colon or the band's
 * dot separator (`・`, `·`) around it, so a slash chord, a date or "1/2"
 * inside a word is not one). Pure: `tempo` is
 * the first mark (null when none), `tempoMarks` every mark in order,
 * `meter` the first time signature (null when none).
 */
export interface ChartStatedValues {
	tempo: number | null;
	tempoMarks: number[];
	meter: string | null;
}

const MEASURE_LINE = /^m\d+\b/;
const SCORE_TEMPO = /\btempo (\d+(?:\.\d+)?)\b/g;
/** A tempo mark a musician could mean (the answer schema's range); a misread "tempo 1200" is no mark. */
const plausible = (bpm: number) => bpm >= 20 && bpm <= 400;
const BAND_TEMPO = /\b(\d{2,3}) ?bpm\b|\bbpm\s*[:=]?\s*(\d{2,3})\b|[♩♪] ?= ?(\d{2,3})\b/gi;
const METER = /(?:^|\s)(\d{1,2}\/\d{1,2})(?=\s|$|:)/m;
/** The band's separators between the facts of a header line ("key: D・4/4・bpm 132"), read as spaces. */
const SEPARATORS = /[・·•]/g;

/** The header of a measure line: everything before its chords' colon. */
function measureHeader(line: string): string {
	const i = line.lastIndexOf(":");
	return i < 0 ? line : line.slice(0, i);
}

function scoreValues(lines: string[]): ChartStatedValues {
	const headers = lines.filter((l) => MEASURE_LINE.test(l)).map(measureHeader);
	const tempoMarks = headers
		.flatMap((h) => [...h.matchAll(SCORE_TEMPO)].map((m) => Number(m[1])))
		.filter(plausible);
	const meter = headers.map((h) => METER.exec(h)?.[1]).find(Boolean) ?? null;
	return { tempo: tempoMarks[0] ?? null, tempoMarks, meter };
}

function bandValues(raw: string): ChartStatedValues {
	const text = raw.replace(SEPARATORS, " ");
	const tempoMarks = [...text.matchAll(BAND_TEMPO)]
		.map((m) => Number(m[1] ?? m[2] ?? m[3]))
		.filter(plausible);
	return { tempo: tempoMarks[0] ?? null, tempoMarks, meter: METER.exec(text)?.[1] ?? null };
}

export function chartStatedValues(chartText: string): ChartStatedValues {
	const lines = chartText.split(/\r?\n/).map((l) => l.trim());
	return lines.some((l) => MEASURE_LINE.test(l)) ? scoreValues(lines) : bandValues(chartText);
}
