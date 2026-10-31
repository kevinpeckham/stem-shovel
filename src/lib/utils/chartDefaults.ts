/**
 * The song's tempo and time signature at 0:00 from its changes, the
 * defaults a chart's bars take before its own marks (`chordChartBars`,
 * `chartBars`). A tempo that is not a positive number is none.
 */
export function chartDefaults(changes: { kind: string; start: number; value: string }[]): {
	tempo: number | null;
	meter: string | null;
} {
	const at0 = (kind: string) =>
		changes.find((c) => c.kind === kind && c.start === 0)?.value ?? null;
	const tempo = Number(at0("tempo"));
	return { tempo: tempo > 0 ? tempo : null, meter: at0("meter") };
}
