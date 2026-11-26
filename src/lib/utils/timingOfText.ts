import { chartHash, type TimingMap } from "@barmark/sync";
import { parseChart } from "barmark";

/**
 * A timing map of an aligned copy of a chart (`chartAlignInput`: the saved
 * text with the song's `time:` line first) carried back to the saved text:
 * the same bar starts under the saved text's hash, which is the map the
 * app kept before @barmark/listen (it hashed the saved text). Null when
 * the saved text does not play the map's bars. A map with no beats holds
 * only bar starts, so the copy's meter changes nothing in it; sync's
 * `rehashTiming` is not used because it refuses exactly this case (a
 * refinement whose bars differ in meter, `meters-differ`).
 */
export function timingOfText(timing: TimingMap, text: string): TimingMap | null {
	const parse = parseChart(text);
	if (parse.bars.length !== timing.chart.bars) return null;
	return { ...timing, chart: { ...timing.chart, hash: chartHash(text, parse) } };
}
