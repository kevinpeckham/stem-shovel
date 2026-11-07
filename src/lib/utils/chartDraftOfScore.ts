import type { ChartDraft, ScoreDiagnostic } from "#lib/state/songChordDraft.svelte.js";

/**
 * A score's imported chart as the draft card's draft ("Chart from score"):
 * no chords by bar, sections or progressions (the chart carries its own),
 * marked as the score's with its name and what the import could not carry
 * over.
 */
export function chartDraftOfScore(
	result: { chart: string; chartHtml: string; diagnostics: ScoreDiagnostic[] },
	scoreName: string,
): ChartDraft {
	return {
		chords: "",
		sections: [],
		progressions: [],
		notes: "",
		chart: result.chart,
		chartHtml: result.chartHtml,
		source: "score",
		scoreName,
		diagnostics: result.diagnostics,
	};
}
