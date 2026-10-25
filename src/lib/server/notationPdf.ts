import { notationPdfPathname } from "#lib/server/blob.js";
import { notationForPdf, setNotationPdf } from "#lib/server/data.js";
import { BlobError, type DbError } from "#lib/server/effect/errors.js";
import { EngraveError } from "#lib/server/effect/notationErrors.js";
import { runJob } from "#lib/server/effect/runJob.js";
import { BlobStore, Db } from "#lib/server/effect/services.js";
import { accessOfPathname } from "#lib/server/relocate.js";
import { engraveNotationPages } from "#lib/utils/engraveNotationPages.js";
import { svgPagesToPdf } from "#lib/utils/svgPagesToPdf.js";
import * as Effect from "effect/Effect";
import createVerovioModule from "verovio/wasm";
import { LOG_OFF, VerovioToolkit, enableLog } from "verovio/esm";

/**
 * A notation file engraved as a PDF (docs/uploads-and-blob.md, "Notation
 * files"): the same Verovio the browser draws the score with, run in Node
 * inside the jobs function (`POST /api/jobs`, kind `notation-pdf`), laying
 * the pages out for A4 and writing them with pdfkit. Only the jobs function
 * imports this module: the 7 MB engine would otherwise sit in every page
 * function's bundle (docs/environment.md, "Cold starts and the jobs
 * function"). A failure is recorded on the row (`pdfStatus: "failed"`, its
 * own failure ignored) and still thrown, so `eachJob` reports it.
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

type Row = NonNullable<Awaited<ReturnType<typeof notationForPdf>>>;

/** Reads the file, engraves it, puts the PDF beside it and points the row at it. */
function engrave(row: Row & { url: string }) {
	return Effect.gen(function* () {
		const store = yield* BlobStore;
		const db = yield* Db;
		const url = row.url;
		const res = yield* store.read(url);
		if (!res.ok) return yield* new BlobError({ op: "read", url, status: res.status });
		const bytes = yield* Effect.tryPromise({
			try: () => res.arrayBuffer(),
			catch: (cause) => new BlobError({ op: "read", url, cause }),
		});
		const pdf = yield* Effect.tryPromise({
			try: async () => {
				const { svgs } = engraveNotationPages(await engine(), bytes, row.filename);
				return svgPagesToPdf(svgs);
			},
			catch: (cause) => new EngraveError({ filename: row.filename, cause }),
		}).pipe(Effect.withSpan("notationPdf.engrave"));
		const pdfPathname = notationPdfPathname(row.accountId, row.songId, row.id);
		const access = yield* db.call("notation-pdf:access", () => accessOfPathname(row.pathname));
		const put = yield* store.put(pdfPathname, pdf, "application/pdf", access);
		yield* db.call("notation-pdf:finish", () =>
			setNotationPdf(row.id, { pdfUrl: put.url, pdfPathname, pdfStatus: "ready" }),
		);
	});
}

export function renderNotationPdfEffect(
	notationId: string,
): Effect.Effect<void, BlobError | DbError | EngraveError, BlobStore | Db> {
	return Effect.gen(function* () {
		const db = yield* Db;
		const row = yield* db.call("notation-pdf:read", () => notationForPdf(notationId));
		if (!row || row.status !== "ready" || !row.url) return;
		yield* engrave({ ...row, url: row.url }).pipe(
			Effect.onError(() =>
				Effect.ignore(
					db.call("notation-pdf:fail", () => setNotationPdf(row.id, { pdfStatus: "failed" })),
					{ log: true },
				),
			),
		);
	}).pipe(Effect.withSpan("notationPdf.render", { attributes: { notationId } }));
}

export function renderNotationPdf(notationId: string): Promise<void> {
	return runJob("job.notation-pdf", renderNotationPdfEffect(notationId));
}
