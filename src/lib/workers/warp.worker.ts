import { renderWarp } from "#lib/audio/warp.js";
import type { StudioWarp } from "#lib/val/StudioSchema.js";

/**
 * A clip's warp rendered off the page (docs/multitrack-recorder.md
 * "Warping a clip"): the WSOLA over a whole file takes a second or more,
 * which would stall the transport and the drawing. A request carries the
 * file's channels (copies, transferred), its rate and the warp; the reply
 * carries the warped content's channels back, transferred too.
 */
export interface WarpRequest {
	id: number;
	channels: Float32Array[];
	sampleRate: number;
	warp: StudioWarp;
}
export interface WarpReply {
	id: number;
	channels: Float32Array[];
}

self.onmessage = (e: MessageEvent<WarpRequest>) => {
	const { id, channels, sampleRate, warp } = e.data;
	const out = renderWarp(channels, sampleRate, warp);
	const reply: WarpReply = { id, channels: out };
	(self as unknown as Worker).postMessage(
		reply,
		out.map((c) => c.buffer as ArrayBuffer),
	);
};
