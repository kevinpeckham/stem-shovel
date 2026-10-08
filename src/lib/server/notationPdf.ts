import { notationPdfPathname, putBlob, readBlob } from "#lib/server/blob.js";
import { notationForPdf, setNotationPdf } from "#lib/server/data.js";
import { accessOfPathname } from "#lib/server/relocate.js";
import { engraveNotationPages } from "#lib/utils/engraveNotationPages.js";
import { svgPagesToPdf } from "#lib/utils/svgPagesToPdf.js";
import createVerovioModule from "verovio/wasm";
import { LOG_OFF, VerovioToolkit, enableLog } from "verovio/esm";

/**
 * A notation file engraved as a PDF (docs/uploads-and-blob.md, "Notation
 * files"): the same Verovio the browser draws the score with, run in Node
 * inside the jobs function (`POST /api/jobs`, kind `notation-pdf`), laying
 * the pages out for A4 and writing them with pdfkit. Only the jobs function
 * imports this module: the 7 MB engine would otherwise sit in every page
 * function's bundle (docs/environment.md, "Cold starts and the jobs
 * function"). A failure is recorded on the row and logged, never thrown.
 */

let toolkit: Promise<VerovioToolkit> | null = null;
/** One engine per function instance, loaded on first use. */
function engine(): Promise<VerovioToolkit> {
	toolkit ??= createVerovioModule().then((module) => {
		enableLog(LOG_OFF, module);
		return new VerovioToolkit(module);
	});
	return toolkit;
}

export async function renderNotationPdf(notationId: string): Promise<void> {
	const row = await notationForPdf(notationId);
	if (!row || row.status !== "ready" || !row.url) return;
	try {
		const res = await readBlob(row.url);
		if (!res.ok) throw new Error(`${res.status} ${res.statusText} reading ${row.url}`);
		const bytes = await res.arrayBuffer();
		const { svgs } = engraveNotationPages(await engine(), bytes, row.filename);
		const pdf = await svgPagesToPdf(svgs);
		const pdfPathname = notationPdfPathname(row.accountId, row.songId, row.id);
		const put = await putBlob(
			pdfPathname,
			Buffer.from(pdf),
			"application/pdf",
			await accessOfPathname(row.pathname),
		);
		await setNotationPdf(row.id, { pdfUrl: put.url, pdfPathname, pdfStatus: "ready" });
	} catch (e) {
		console.error(`[notation-pdf] ${notationId}:`, e);
		await setNotationPdf(row.id, { pdfStatus: "failed" }).catch((err) =>
			console.error(`[notation-pdf] ${notationId}: could not record the failure`, err),
		);
	}
}
