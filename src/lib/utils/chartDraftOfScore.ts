import type { ChartDraft, ScoreDiagnostic } from "#lib/state/songChordDraft.svelte.js";

/**
 * A score's imported chart as the draft card's draft ("Chart from score"):
 * no chords by bar, sections or progressions (the chart carries its own),
 * marked as the score's with its name and what the import could not carry
 * over; the notation file and its parts ride along so the card can chart a
 * part when the score has no chord symbols.
 */
export function chartDraftOfScore(
	result: {
		chart: string;
		chartHtml: string;
		diagnostics: ScoreDiagnostic[];
		notationId?: string;
		parts?: string[];
		partName?: string;
	},
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
		notationId: result.notationId,
		parts: result.parts ?? [],
		...(result.partName ? { partName: result.partName } : {}),
	};
}
