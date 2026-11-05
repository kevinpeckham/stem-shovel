import { parseChart } from "barmark";
import { barmarkChartBars } from "./barmarkChartBars.js";
import { chartBarSeconds } from "./chartBarSeconds.js";
import { chartDiagnosticText } from "./chartDiagnosticText.js";
import { chartStatedValues } from "./chartStatedValues.js";
import { formatTime } from "./formatTime.js";

/** "1 section", "no sections", "10 sections". */
function sectionsText(n: number): string {
	if (n === 0) return "no sections";
	return n === 1 ? "1 section" : `${n} sections`;
}

/**
 * What barmark (`barmarkChartBars`) reads of a chart, as one line under
 * the document: "76 bars · 10 sections · 2:18" (the bars it plays, the
 * sections they begin and the chart's length at its tempos), with the
 * parser's warnings; when nothing reads, why, in plain words: no tempo,
 * or no bars, with the parser's errors as the warnings (a chart typed as
 * prose, "Verse: D A Bm G", has "no bar lines"; an empty bar or a chord
 * it cannot read drops its line, and a chart of one such line has nothing
 * left) and `hint` set, for a line on how bars are written. `defaults` are the song's tempo and meter at 0:00
 * (`chartDefaults`). Null for a blank chart.
 */
export function chartReadout(
	markdown: string,
	defaults: { tempo: number | null; meter: string | null },
): { summary: string; warnings: string[]; hint: boolean } | null {
	if (!markdown.trim()) return null;
	const read = barmarkChartBars(markdown, defaults);
	if (!read) {
		const tempo = chartStatedValues(markdown).tempo ?? defaults.tempo;
		if (!tempo)
			return {
				summary: "No tempo: add one to the chart or the song's settings",
				warnings: [],
				hint: false,
			};
		return {
			summary: "No bars read",
			warnings: parseChart(markdown).diagnostics.map(chartDiagnosticText),
			hint: true,
		};
	}
	const { bars, warnings } = read;
	const sections = bars.filter((b) => b.section).length;
	const seconds = bars.reduce((sum, b) => sum + chartBarSeconds(b.meter, b.bpm), 0);
	const barsText = bars.length === 1 ? "1 bar" : `${bars.length} bars`;
	return {
		summary: `${barsText} · ${sectionsText(sections)} · ${formatTime(Math.round(seconds), 0)}`,
		warnings,
		hint: false,
	};
}
