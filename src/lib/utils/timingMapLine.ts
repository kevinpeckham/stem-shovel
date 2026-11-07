import type { TimingMap } from "@barmark/sync";

/** What the song's chart timing map holds, in a sentence for the Tempo & key tab's Bar timing block. */
export function timingMapLine(timing: TimingMap | null): string {
	if (!timing) {
		return "No timing map yet: draft a chart from the detected chords, or place the chart from the stems.";
	}
	const n = timing.bars.length;
	const bars = `${n} ${n === 1 ? "bar" : "bars"}`;
	if (timing.source === "aligned") return `${bars} from the aligned chart.`;
	if (timing.source === "detected") return `${bars} from the detected chords.`;
	return `${bars} on the chart's timing map.`;
}
