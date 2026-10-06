import type { NotationRenderReply, NotationRenderRequest } from "$lib/workers/notation.worker";

/**
 * MusicXML (or a compressed `.mxl`) as SVG pages, rendered by Verovio in a
 * worker (docs/uploads-and-blob.md, "Notation"): the worker, and the engine
 * it loads, start on the first call and serve every later one. The page
 * never parses the XML itself.
 */
let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (reply: NotationRenderReply) => void>();

function start(): Worker {
	if (worker) return worker;
	worker = new Worker(new URL("../workers/notation.worker.ts", import.meta.url), {
		type: "module",
	});
	worker.onmessage = (e: MessageEvent<NotationRenderReply>) => {
		const done = pending.get(e.data.id);
		pending.delete(e.data.id);
		done?.(e.data);
	};
	worker.onerror = () => {
		for (const [id, done] of pending) done({ id, ok: false, error: "The notation engine failed" });
		pending.clear();
		worker?.terminate();
		worker = null;
	};
	return worker;
}

export async function renderNotation(
	bytes: ArrayBuffer,
	name: string,
	options: { width: number; scale?: number; firstPageOnly?: boolean },
): Promise<{ pages: number; svgs: string[] }> {
	const id = nextId++;
	const reply = await new Promise<NotationRenderReply>((resolve) => {
		pending.set(id, resolve);
		const request: NotationRenderRequest = {
			id,
			bytes,
			name,
			width: options.width,
			scale: options.scale ?? 40,
			firstPageOnly: options.firstPageOnly,
		};
		start().postMessage(request);
	});
	if (!reply.ok) throw new Error(reply.error);
	return { pages: reply.pages, svgs: reply.svgs };
}
