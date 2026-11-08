import { recordingFeatures } from "#lib/audio/chartAlignment.js";

/**
 * The recording's own features off the page (audio/chartAlignment.ts
 * `recordingFeatures`: the chromagram, flattened 12 a frame, and where the
 * sound starts and ends), for the chartless grid's section witness and its
 * placement (audio/chartlessGridInBrowser.ts), run beside the envelope's
 * worker (workers/alignmentEnvelope.worker.ts). A request carries the
 * recording mixed to mono (transferred) at its rate; the reply carries the
 * features (the chroma's buffer transferred), or the reason there are none.
 */
export interface RecordingFeaturesRequest {
	id: number;
	recording: Float32Array;
	sampleRate: number;
}
export type RecordingFeaturesReply =
	| {
			id: number;
			chroma: Float32Array;
			frames: number;
			hopSec: number;
			firstSound: number;
			lastSound: number;
	  }
	| { id: number; error: string };

self.onmessage = (e: MessageEvent<RecordingFeaturesRequest>) => {
	const { id, recording, sampleRate } = e.data;
	try {
		const features = recordingFeatures(recording, sampleRate);
		const reply: RecordingFeaturesReply = { id, ...features };
		(self as unknown as Worker).postMessage(reply, [features.chroma.buffer]);
	} catch (err) {
		const reply: RecordingFeaturesReply = {
			id,
			error: err instanceof Error ? err.message : String(err),
		};
		(self as unknown as Worker).postMessage(reply);
	}
};
