import { alignmentEnvelope } from "#lib/audio/chartAlignment.js";

/**
 * The chart alignment's onset envelope off the page
 * (audio/chartAlignment.ts `alignmentEnvelope`), run beside the warping's
 * worker (workers/alignChart.worker.ts) so the two take the time of the
 * longer one. A request carries the recording mixed to mono (transferred)
 * at its rate; the reply carries the envelope (its buffer transferred) and
 * its frames per second, or the reason there is none.
 */
export interface AlignmentEnvelopeRequest {
	id: number;
	recording: Float32Array;
	sampleRate: number;
}
export type AlignmentEnvelopeReply =
	| { id: number; onset: Float32Array; fps: number }
	| { id: number; error: string };

self.onmessage = (e: MessageEvent<AlignmentEnvelopeRequest>) => {
	const { id, recording, sampleRate } = e.data;
	try {
		const { onset, fps } = alignmentEnvelope(recording, sampleRate);
		const reply: AlignmentEnvelopeReply = { id, onset, fps };
		(self as unknown as Worker).postMessage(reply, [onset.buffer]);
	} catch (err) {
		const reply: AlignmentEnvelopeReply = {
			id,
			error: err instanceof Error ? err.message : String(err),
		};
		(self as unknown as Worker).postMessage(reply);
	}
};
