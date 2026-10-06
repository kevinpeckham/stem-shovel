import wasmModuleUrl from "verovio/wasm?url";
import { LOG_OFF, VerovioToolkit, enableLog } from "verovio/esm";
import { engraveNotation } from "$lib/utils/engraveNotation";

/**
 * Verovio in a worker (docs/uploads-and-blob.md, "Notation"): the 7 MB
 * engine loads here, off the page, only when a song's notation is
 * rendered. A request carries the file's bytes and its name (a `.mxl` is
 * a zip, the rest MusicXML text), the width to lay the pages out for and
 * the scale, and gets back every page as SVG, sized by its viewBox so the
 * page can scale it. One toolkit, reused; a failure is reported, not
 * thrown.
 */
export interface NotationRenderRequest {
	id: number;
	bytes: ArrayBuffer;
	name: string;
	/** The width to fill, in CSS pixels, and the engraving scale (percent). */
	width: number;
	scale: number;
	/** Only the first page (a thumbnail). */
	firstPageOnly?: boolean;
}
export type NotationRenderReply =
	| { id: number; ok: true; pages: number; svgs: string[] }
	| { id: number; ok: false; error: string };

let toolkit: Promise<VerovioToolkit> | null = null;
function ready(): Promise<VerovioToolkit> {
	// The 7 MB engine module as it ships, by its URL: Vite's dependency pre-bundling breaks
	// Emscripten's factory inside a worker, and an asset loads on demand either way.
	toolkit ??= import(/* @vite-ignore */ wasmModuleUrl)
		.then((m: { default: () => Promise<unknown> }) => m.default())
		.then((module) => {
			enableLog(LOG_OFF, module);
			return new VerovioToolkit(module);
		});
	return toolkit;
}

self.onmessage = async (e: MessageEvent<NotationRenderRequest>) => {
	const { id, bytes, name, width, scale, firstPageOnly } = e.data;
	try {
		const vrv = await ready();
		const { pages, svgs } = engraveNotation(vrv, bytes, name, { width, scale, firstPageOnly });
		const reply: NotationRenderReply = { id, ok: true, pages, svgs };
		self.postMessage(reply);
	} catch (err) {
		const reply: NotationRenderReply = { id, ok: false, error: String(err) };
		self.postMessage(reply);
	}
};
