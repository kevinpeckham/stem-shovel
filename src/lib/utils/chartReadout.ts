import { chartBarSeconds } from "./chartBarSeconds.js";
import { chartBarsOfMarkdown } from "./chartBarsOfMarkdown.js";
import { chartStatedValues } from "./chartStatedValues.js";
import { formatTime } from "./formatTime.js";

/** "1 section", "no sections", "10 sections". */
function sectionsText(n: number): string {
	if (n === 0) return "no sections";
	return n === 1 ? "1 section" : `${n} sections`;
}

/**
 * What the chord chart parser (`chartBarsOfMarkdown`: barmark, else the
 * old idiom) reads of a chart, as one line under the document: "76 bars ·
 * 10 sections · 2:18" (the bars it plays, the sections they begin and the
 * chart's length at its tempos),
 * with the parser's warnings; when nothing reads, why, in plain words.
 * `defaults` are the song's tempo and meter at 0:00 (`chartDefaults`).
 * Null for a blank chart.
 */
export function chartReadout(
	markdown: string,
	defaults: { tempo: number | null; meter: string | null },
): { summary: string; warnings: string[] } | null {
	if (!markdown.trim()) return null;
	const read = chartBarsOfMarkdown(markdown, defaults);
	if (!read) {
		const tempo = chartStatedValues(markdown).tempo ?? defaults.tempo;
		const summary = tempo
			? "No bars read"
			: "No tempo: add one to the chart or the song's settings";
		return { summary, warnings: [] };
	}
	const { bars, warnings } = read;
	const sections = bars.filter((b) => b.section).length;
	const seconds = bars.reduce((sum, b) => sum + chartBarSeconds(b.meter, b.bpm), 0);
	const barsText = bars.length === 1 ? "1 bar" : `${bars.length} bars`;
	return {
		summary: `${barsText} · ${sectionsText(sections)} · ${formatTime(Math.round(seconds), 0)}`,
		warnings,
	};
}
