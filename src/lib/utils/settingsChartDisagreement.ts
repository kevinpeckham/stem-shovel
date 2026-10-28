/**
 * The caveat for the song-check's key-change placement when the song's
 * settings disagree with what the chart states (stem-bench Study 7,
 * 2026-10-28): the model follows the bars at the settings' tempo, so a
 * wrong setting moves every change it places (3 of 3 placed right fell to
 * 1 of 3). Pure: the settings as stored (tempo a string of bpm) and the
 * chart's own values (`chartStatedValues`) in; the warning, or null when
 * they agree or either side states nothing. Tempos within 2 % agree.
 */
export function settingsChartDisagreement(
	settings: { tempo: string | null; meter: string | null },
	chart: { tempo: number | null; meter: string | null },
): string | null {
	const setTempo = settings.tempo ? Number.parseFloat(settings.tempo) : NaN;
	const tempoDiffers =
		Number.isFinite(setTempo) &&
		setTempo > 0 &&
		chart.tempo !== null &&
		Math.abs(setTempo - chart.tempo) / chart.tempo > 0.02;
	const meterDiffers = !!settings.meter && !!chart.meter && settings.meter !== chart.meter;
	if (!tempoDiffers && !meterDiffers) return null;
	const parts = [
		tempoDiffers ? `${setTempo} bpm but the chart marks ${chart.tempo}` : null,
		meterDiffers ? `${settings.meter} but the chart marks ${chart.meter}` : null,
	].filter(Boolean);
	return `The song's settings say ${parts.join(", and ")}: the key changes are placed approximately.`;
}
