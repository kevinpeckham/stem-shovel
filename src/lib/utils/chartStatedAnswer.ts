/**
 * The listening model's answer trimmed to what the chart states (stem-bench
 * Study 4, FINDINGS.md "AI features"): blind, the model pins tempo to a
 * genre prior and echoes whatever candidates it is handed, so its tempo
 * and time signature are kept only where the chart's summary carries a
 * tempo mark (or a band's chart says "120 bpm") or a time signature. The keys and key changes stay: the
 * chart's key signatures and chords are what it read them from, and
 * placing them in the recording measured exact. Without a summary (a PDF
 * the reader could not write out) only the keys survive.
 */
export function chartStatedAnswer<
	A extends { tempo: number | null; tempoChanges: unknown[]; meter: string | null },
>(answer: A, chartText: string | undefined): A {
	const text = chartText ?? "";
	// "tempo 120" in a score's summary; "120 bpm" or "♩ = 120" in a band's own chart.
	const saysTempo = /\btempo \d|\b\d{2,3} ?bpm\b|[♩♪] ?= ?\d{2,3}/i.test(text);
	const saysMeter = /(^|\s)\d{1,2}\/\d{1,2}(?=\s|$|:)/m.test(text);
	return {
		...answer,
		tempo: saysTempo ? answer.tempo : null,
		tempoChanges: saysTempo ? answer.tempoChanges : [],
		meter: saysMeter ? answer.meter : null,
	};
}
