import type { TimingMap } from "@barmark/sync";
import { formatTime } from "./formatTime.js";
import { median } from "./median.js";

/**
 * What the song's chart timing map holds, in a sentence for the Tempo & key
 * tab's Bar timing block. An aligned map, beside the song's declared bar
 * (its tempo and time signature), also says where bar 1 lands and how long
 * its bars run against the declared one.
 */
export function timingMapLine(
	timing: TimingMap | null,
	declared?: { barSeconds: number } | null,
): string {
	if (!timing) {
		return "No timing map yet: draft a chart from the detected chords, or place the chart from the stems.";
	}
	const n = timing.bars.length;
	const bars = `${n} ${n === 1 ? "bar" : "bars"}`;
	if (timing.source === "aligned") {
		if (!declared || n === 0) return `${bars} from the aligned chart.`;
		const starts = [...timing.bars.map((b) => b.start), timing.end];
		const span = median(starts.slice(1).map((t, i) => t - starts[i]!));
		return `${bars} from the aligned chart: bar 1 at ${formatTime(starts[0]!, 0)}, bars ${span.toFixed(1)} s (the tempo says ${declared.barSeconds.toFixed(2)} s).`;
	}
	if (timing.source === "detected") return `${bars} from the detected chords.`;
	return `${bars} on the chart's timing map.`;
}
