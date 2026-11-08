import {
	alignChartPath,
	type AlignmentPath,
	type RecordingFeatures,
	recordingFeatures,
} from "#lib/audio/chartAlignment.js";
import type { ChartBar } from "#lib/utils/barmarkChartBars.js";

/**
 * A chart's warping path in a recording off the page
 * (audio/chartAlignment.ts `alignChartPath`): the warping is a few hundred
 * million steps for a long song, seconds of work that would stall the
 * player and the drawing. A request carries the bars and either the
 * recording mixed to mono (transferred) at its rate, or the recording's
 * features at that rate (`features`, cached in the browser by
 * audio/alignmentFeaturesCache.ts), so a second alignment after a chart
 * edit skips the recording's chromagram. The reply carries the path's
 * alignment (before the end repair, which the page applies with the
 * envelope from workers/alignmentEnvelope.worker.ts) and, given a
 * recording, the features it computed (their chroma transferred), so the
 * page can keep them; or the reason there is none.
 */
export interface AlignChartRequest {
	id: number;
	bars: Pick<ChartBar, "chords" | "bpm" | "meter">[];
	recording?: Float32Array;
	features?: RecordingFeatures;
	sampleRate: number;
}
export type AlignChartReply =
	| { id: number; path: AlignmentPath; features?: RecordingFeatures }
	| { id: number; error: string };

self.onmessage = (e: MessageEvent<AlignChartRequest>) => {
	const { id, bars, recording, sampleRate } = e.data;
	let reply: AlignChartReply;
	const transfer: Transferable[] = [];
	try {
		const given = e.data.features;
		if (!given && !recording) throw new Error("There is no audio to align the chart to");
		const features = given ?? recordingFeatures(recording!, sampleRate);
		reply = { id, path: alignChartPath(bars, features, sampleRate) };
		if (!given) {
			reply.features = features;
			transfer.push(features.chroma.buffer);
		}
	} catch (err) {
		reply = { id, error: err instanceof Error ? err.message : String(err) };
	}
	(self as unknown as Worker).postMessage(reply, transfer);
};
