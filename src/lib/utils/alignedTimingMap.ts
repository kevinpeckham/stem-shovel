import { chartHash, checkTimingMap, type TimingMap } from "@barmark/sync";

/**
 * The timing map of the song's own chart from its alignment to the stems
 * (`alignChartInBrowser`: a start per played bar and where the last ends),
 * `source: "aligned"`, or null unless it checks clean against `text`
 * (no error from `checkTimingMap`: the bar count and the hash fit).
 */
export function alignedTimingMap(
	text: string,
	bars: number,
	barStarts: number[],
	duration: number,
): TimingMap | null {
	const end = barStarts[bars];
	if (bars < 1 || end === undefined) return null;
	const map: TimingMap = {
		format: "barmark-timing",
		version: 1,
		chart: { bars, hash: chartHash(text) },
		recording: { duration },
		source: "aligned",
		bars: barStarts.slice(0, bars).map((start, i) => ({ bar: i + 1, start })),
		end,
	};
	return checkTimingMap(map, { text }).map;
}
