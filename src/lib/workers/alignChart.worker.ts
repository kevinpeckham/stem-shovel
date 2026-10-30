import { alignChart, type Alignment } from "#lib/audio/chartAlignment.js";
import type { ChartBar } from "#lib/utils/chartBars.js";

/**
 * A chart aligned to a recording off the page (audio/chartAlignment.ts):
 * the warping is a few hundred million steps for a long song, seconds of
 * work that would stall the player and the drawing. A request carries the
 * bars and the recording mixed to mono (transferred) at its rate; the
 * reply carries the alignment, or the reason there is none.
 */
export interface AlignChartRequest {
	id: number;
	bars: Pick<ChartBar, "chords" | "bpm" | "meter">[];
	recording: Float32Array;
	sampleRate: number;
}
export type AlignChartReply = { id: number; alignment: Alignment } | { id: number; error: string };

self.onmessage = (e: MessageEvent<AlignChartRequest>) => {
	const { id, bars, recording, sampleRate } = e.data;
	let reply: AlignChartReply;
	try {
		reply = { id, alignment: alignChart(bars, recording, sampleRate) };
	} catch (err) {
		reply = { id, error: err instanceof Error ? err.message : String(err) };
	}
	(self as unknown as Worker).postMessage(reply);
};
