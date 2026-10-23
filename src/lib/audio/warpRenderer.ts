import type { StudioWarp } from "#lib/val/StudioSchema.js";
import type { WarpReply, WarpRequest } from "#lib/workers/warp.worker.js";
import { renderWarp } from "./warp.js";

/**
 * A warp rendered in the worker (workers/warp.worker.ts), the worker
 * started on the first call and kept; where there is no Worker (a test,
 * the server) the rendering runs here. The channels handed in are copied,
 * so a buffer's own data is never detached.
 */
let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<
	number,
	{ resolve: (channels: Float32Array[]) => void; request: WarpRequest }
>();

function start(): Worker {
	if (worker) return worker;
	worker = new Worker(new URL("../workers/warp.worker.ts", import.meta.url), { type: "module" });
	worker.onmessage = (e: MessageEvent<WarpReply>) => {
		const job = pending.get(e.data.id);
		pending.delete(e.data.id);
		job?.resolve(e.data.channels);
	};
	worker.onerror = () => {
		// The worker failed: what it owed is rendered here, and the next call starts a fresh one.
		const owed = Array.from(pending.values());
		pending.clear();
		worker?.terminate();
		worker = null;
		for (const job of owed)
			job.resolve(renderWarp(job.request.channels, job.request.sampleRate, job.request.warp));
	};
	return worker;
}

export function renderWarpAsync(
	channels: Float32Array[],
	sampleRate: number,
	warp: StudioWarp,
): Promise<Float32Array[]> {
	const copies = channels.map((c) => c.slice());
	if (typeof Worker === "undefined") return Promise.resolve(renderWarp(copies, sampleRate, warp));
	const id = nextId++;
	return new Promise((resolve) => {
		// The request keeps its own copy for the fallback; the worker gets another, transferred.
		const request: WarpRequest = { id, channels: copies, sampleRate, warp };
		pending.set(id, { resolve, request });
		const sent = copies.map((c) => c.slice());
		start().postMessage(
			{ ...request, channels: sent } satisfies WarpRequest,
			sent.map((c) => c.buffer as ArrayBuffer),
		);
	});
}
