import { chartStatedValues } from "./chartStatedValues.js";

/**
 * The listening model's answer with its tempo and time signature replaced
 * by what the chart's text states (stem-bench Study 4 and Study 7,
 * 2026-10-28; FINDINGS.md "AI features"). Study 7 found the model echoes
 * the song's settings as the tempo on a chart that marks none (47 of 47
 * cells), and once echoed a wrong setting under a chart that stated the
 * true tempo, which a gate on the chart merely MENTIONING a tempo let
 * through. Tempo marks and time signatures are machine-readable text
 * (`chartStatedValues`), so they need no model: `tempo` and `meter` are
 * the chart's own (null where it states none, whatever the model said; the
 * model's "free" goes with it). The model is kept for what measured exact:
 * the keys, and placing marks in seconds. So `tempoChanges` keeps the
 * model's placements only when the chart has two or more tempo marks,
 * trimmed to the chart's count of later marks, each `bpm` replaced by the
 * chart's corresponding later mark. Without a summary (a PDF the reader
 * could not write out) only the keys survive. `askAiAboutMix` returns only
 * this gated answer, so the page never shows the model's raw tempo or meter.
 */
export function chartStatedAnswer<
	A extends {
		tempo: number | null;
		tempoChanges: { at: number; bpm: number }[];
		meter: string | null;
	},
>(answer: A, chartText: string | undefined): A {
	const stated = chartStatedValues(chartText ?? "");
	const later = stated.tempoMarks.slice(1);
	return {
		...answer,
		tempo: stated.tempo,
		tempoChanges: answer.tempoChanges
			.slice(0, later.length)
			.map((c, i) => ({ ...c, bpm: later[i]! })),
		meter: stated.meter,
	};
}
