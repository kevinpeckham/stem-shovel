import { type AlignInput, alignChart } from "@barmark/listen";

/**
 * A chart aligned to a recording off the page (@barmark/listen's
 * `alignChart`): the chart's render, the warping (a few hundred million
 * steps for a long song, seconds of work that would stall the player and
 * the drawing), the re-phase, the fit, the placements and the timing map.
 * A request carries the alignment's input with the recording's features
 * (audio/alignmentWorkers.ts, cached in the browser); the reply carries
 * the package's answer as it is (it never throws: a refusal is a value),
 * or the reason there is none when the worker itself failed.
 */
export interface AlignChartRequest {
	id: number;
	input: AlignInput;
}
export type AlignChartReply =
	| { id: number; result: ReturnType<typeof alignChart> }
	| { id: number; error: string };

self.onmessage = (e: MessageEvent<AlignChartRequest>) => {
	const { id, input } = e.data;
	let reply: AlignChartReply;
	try {
		reply = { id, result: alignChart(input) };
	} catch (err) {
		reply = { id, error: err instanceof Error ? err.message : String(err) };
	}
	(self as unknown as Worker).postMessage(reply);
};
