import { alignChartPath, type AlignmentPath } from "#lib/audio/chartAlignment.js";
import type { ChartBar } from "#lib/utils/barmarkChartBars.js";

/**
 * A chart's warping path in a recording off the page
 * (audio/chartAlignment.ts `alignChartPath`): the warping is a few hundred
 * million steps for a long song, seconds of work that would stall the
 * player and the drawing. A request carries the bars and the recording
 * mixed to mono (transferred) at its rate; the reply carries the path's
 * alignment (before the end repair, which the page applies with the
 * envelope from workers/alignmentEnvelope.worker.ts), or the reason there
 * is none.
 */
export interface AlignChartRequest {
	id: number;
	bars: Pick<ChartBar, "chords" | "bpm" | "meter">[];
	recording: Float32Array;
	sampleRate: number;
}
export type AlignChartReply = { id: number; path: AlignmentPath } | { id: number; error: string };

self.onmessage = (e: MessageEvent<AlignChartRequest>) => {
	const { id, bars, recording, sampleRate } = e.data;
	let reply: AlignChartReply;
	try {
		reply = { id, path: alignChartPath(bars, recording, sampleRate) };
	} catch (err) {
		reply = { id, error: err instanceof Error ? err.message : String(err) };
	}
	(self as unknown as Worker).postMessage(reply);
};
