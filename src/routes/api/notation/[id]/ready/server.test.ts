import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import "../../../../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	asAdminOf,
	asEditorOf,
	asOutsider,
	asSignedOut,
	asViewerOf,
	fakeId,
	httpError,
	type FakeRequestEvent,
} from "../../../../../../tests/helpers/fakeRequestEvent";
import {
	blob,
	data,
	givenRow,
	jobs,
	resetRemoteMocks,
	type Mocks,
} from "../../../../../../tests/helpers/fakeServerModules";
import { callRoute } from "../../../../../../tests/helpers/fakeApiEvent";
import { NOTATION_THUMBNAIL_MAX_BYTES } from "#lib/constants/notationFormats.js";

/**
 * Step 3 of a notation upload: an editor reports the blob URL, the page
 * count and the first page; the server sniffs the stored file's first bytes
 * before believing it, stores the thumbnail beside it, marks the row ready
 * and asks the jobs function for the PDF.
 */
const { POST } = await import("./+server");

const SONG = fakeId("song-one");
const NOTATION = fakeId("notation-one");
const pathname = `accounts/${ACCOUNT}/songs/${SONG}/notation/${NOTATION}.musicxml`;
const mxlPathname = `accounts/${ACCOUNT}/songs/${SONG}/notation/${NOTATION}.mxl`;
const url = `https://store.private.blob.vercel-storage.com/${pathname}`;
const thumbPathname = `accounts/${ACCOUNT}/songs/${SONG}/notation/${NOTATION}.thumb-abc.webp`;
const thumbUrl = `https://store.private.blob.vercel-storage.com/${thumbPathname}`;

const MUSICXML = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n<score-partwise version="4.0"><part-list/></score-partwise>`;
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
/** A WebP's RIFF header: "RIFF", a size, "WEBP". */
const WEBP = new Uint8Array([
	0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
]);
const PNG = new Uint8Array([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

/** The stored file as the blob store answers a read: a fresh Response each time (a body reads once). */
const stored = (bytes: Uint8Array<ArrayBuffer> | string) =>
	blob.readBlob.mockImplementation(async () => new Response(bytes));

function formPost(
	fields: Record<string, string | File | undefined> = { url, pageCount: "3" },
	locals: FakeRequestEvent = asEditorOf(ACCOUNT),
) {
	const form = new FormData();
	for (const [name, value] of Object.entries(fields))
		if (value !== undefined) form.append(name, value);
	const request = new Request(`http://localhost/api/notation/${NOTATION}/ready`, {
		method: "POST",
		body: form,
	});
	return callRoute(POST, locals, request, { id: NOTATION });
}
const thumbnail = (bytes: Uint8Array<ArrayBuffer>, type = "image/webp", name = "page-1.webp") =>
	new File([bytes], name, { type });
/** The relocate module is auto-mocked by fakeServerModules; `accessOfPathname` answers the store the thumbnail goes to. */
const relocate = (await import("#lib/server/relocate.js")) as unknown as Mocks;

beforeEach(() => {
	resetRemoteMocks();
	givenRow("songNotation", { accountId: ACCOUNT });
	data.reservedPathname.mockResolvedValue(pathname);
	blob.isOurBlobUrl.mockReturnValue(true);
	stored(MUSICXML);
	blob.notationThumbnailPathname.mockReturnValue(thumbPathname);
	blob.putBlob.mockResolvedValue({ url: thumbUrl });
	relocate.accessOfPathname.mockResolvedValue("private");
	data.markNotationReady.mockResolvedValue({ id: NOTATION, shareCode: "share-code-0123" });
});
afterEach(() => vi.useRealTimers());

describe("POST /api/notation/[id]/ready", () => {
	it("400 without an https URL, before any lookup", async () => {
		await expect(formPost({ pageCount: "3" })).rejects.toMatchObject(httpError(400));
		await expect(formPost({ url: "http://example.com/x" })).rejects.toMatchObject(httpError(400));
		expect(data.reservedPathname).not.toHaveBeenCalled();
	});
	it("a restricted project admits a member only when added to it, as reserving the file did", async () => {
		const PROJECT = fakeId("proj-one");
		givenRow("songNotation", { accountId: ACCOUNT, song: { projectId: PROJECT } });
		data.projectRestricted.mockResolvedValue(true);
		data.projectRoleOf.mockResolvedValue(null);
		await expect(formPost()).rejects.toMatchObject(httpError(404));
		expect(data.projectRestricted).toHaveBeenCalledWith(PROJECT);
		expect(blob.readBlob).not.toHaveBeenCalled();
		data.projectRoleOf.mockResolvedValue("member");
		const res = await formPost();
		expect(res.status).toBe(200);
	});
	it("401 signed out, 404 for an outsider and for a viewer", async () => {
		await expect(formPost(undefined, asSignedOut())).rejects.toMatchObject(httpError(401));
		await expect(formPost(undefined, asOutsider())).rejects.toMatchObject(httpError(404));
		await expect(formPost(undefined, asViewerOf(ACCOUNT))).rejects.toMatchObject(httpError(404));
		expect(blob.readBlob).not.toHaveBeenCalled();
		expect(data.markNotationReady).not.toHaveBeenCalled();
	});
	it("404 for an unknown notation file", async () => {
		givenRow("songNotation", null);
		await expect(formPost()).rejects.toMatchObject(httpError(404));
	});
	it("400 when nothing was reserved or the URL is another file", async () => {
		data.reservedPathname.mockResolvedValue(null);
		await expect(formPost()).rejects.toMatchObject(httpError(400));
		expect(data.reservedPathname).toHaveBeenCalledWith(ACCOUNT, "notation", NOTATION);
		data.reservedPathname.mockResolvedValue(pathname);
		blob.isOurBlobUrl.mockReturnValue(false);
		await expect(formPost()).rejects.toMatchObject(httpError(400));
		expect(blob.isOurBlobUrl).toHaveBeenCalledWith(url, pathname);
		expect(blob.readBlob).not.toHaveBeenCalled();
	});
	it("415 and the row removed when a .musicxml file does not start like MusicXML", async () => {
		stored("<html><body>not a score</body></html>");
		await expect(formPost()).rejects.toMatchObject({
			status: 415,
			body: { message: "That file is not MusicXML" },
		});
		expect(blob.readBlob).toHaveBeenCalledWith(url);
		expect(data.failNotation).toHaveBeenCalledWith(ACCOUNT, NOTATION);
		expect(data.markNotationReady).not.toHaveBeenCalled();
		expect(jobs.scheduleNotationPdf).not.toHaveBeenCalled();
	});
	it("an .mxl must start like a zip; MusicXML text in its place is refused", async () => {
		data.reservedPathname.mockResolvedValue(mxlPathname);
		stored(MUSICXML);
		await expect(formPost()).rejects.toMatchObject({
			status: 415,
			body: { message: "That file is not a compressed MusicXML file" },
		});
		expect(data.failNotation).toHaveBeenCalledWith(ACCOUNT, NOTATION);
		stored(ZIP);
		expect((await formPost()).status).toBe(200);
	});
	it("a zip where plain MusicXML was promised is refused", async () => {
		stored(ZIP);
		await expect(formPost()).rejects.toMatchObject(httpError(415));
	});
	it("a read that fails at first is tried again a second later", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout"] });
		blob.readBlob
			.mockRejectedValueOnce(new Error("not yet"))
			.mockImplementation(async () => new Response(MUSICXML));
		const pending = formPost();
		await vi.advanceTimersByTimeAsync(1000);
		expect((await pending).status).toBe(200);
		expect(blob.readBlob).toHaveBeenCalledTimes(2);
		expect(data.failNotation).not.toHaveBeenCalled();
	});
	it("415 and the row removed when the store has nothing to read after two tries", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout"] });
		blob.readBlob.mockImplementation(async () => new Response(null, { status: 404 }));
		const pending = formPost();
		pending.catch(() => {});
		await vi.advanceTimersByTimeAsync(1000);
		await vi.advanceTimersByTimeAsync(1000);
		await expect(pending).rejects.toMatchObject(httpError(415));
		expect(blob.readBlob).toHaveBeenCalledTimes(2);
		expect(data.failNotation).toHaveBeenCalledWith(ACCOUNT, NOTATION);
	});
	it("404 when the data layer finds no row to mark", async () => {
		data.markNotationReady.mockResolvedValue(null);
		await expect(formPost()).rejects.toMatchObject(httpError(404));
		expect(jobs.scheduleNotationPdf).not.toHaveBeenCalled();
	});
	it("marks the file ready with its page count, no thumbnail, and asks for the PDF", async () => {
		const res = await formPost({ url, pageCount: "3" });
		expect(await res.json()).toEqual({ ok: true, shareCode: "share-code-0123" });
		expect(data.markNotationReady).toHaveBeenCalledWith(ACCOUNT, NOTATION, {
			url,
			pageCount: 3,
			thumbnailUrl: null,
			thumbnailPathname: null,
		});
		expect(blob.putBlob).not.toHaveBeenCalled();
		expect(jobs.scheduleNotationPdf).toHaveBeenCalledWith(NOTATION);
	});
	it("an admin of the account passes too", async () => {
		expect((await formPost(undefined, asAdminOf(ACCOUNT))).status).toBe(200);
	});
	it("a page count that is missing, not a whole number, zero or absurd is unknown", async () => {
		for (const pageCount of [undefined, "", "abc", "2.5", "0", "-1", "10000"]) {
			await formPost({ url, pageCount });
			expect(data.markNotationReady).toHaveBeenLastCalledWith(
				ACCOUNT,
				NOTATION,
				expect.objectContaining({ pageCount: null }),
			);
		}
		await formPost({ url, pageCount: "9999" });
		expect(data.markNotationReady).toHaveBeenLastCalledWith(
			ACCOUNT,
			NOTATION,
			expect.objectContaining({ pageCount: 9999 }),
		);
	});
	it("a WebP thumbnail is stored beside the file, in the file's store, and recorded on the row", async () => {
		const res = await formPost({ url, pageCount: "1", thumbnail: thumbnail(WEBP) });
		expect(res.status).toBe(200);
		expect(blob.notationThumbnailPathname).toHaveBeenCalledWith(ACCOUNT, SONG, NOTATION, "webp");
		expect(relocate.accessOfPathname).toHaveBeenCalledWith(pathname);
		expect(blob.putBlob).toHaveBeenCalledWith(
			thumbPathname,
			Buffer.from(WEBP),
			"image/webp",
			"private",
		);
		expect(data.markNotationReady).toHaveBeenCalledWith(ACCOUNT, NOTATION, {
			url,
			pageCount: 1,
			thumbnailUrl: thumbUrl,
			thumbnailPathname: thumbPathname,
		});
	});
	it("a PNG thumbnail is typed by its bytes, not by what the browser called it", async () => {
		await formPost({ url, thumbnail: thumbnail(PNG, "image/webp", "page-1.webp") });
		expect(blob.notationThumbnailPathname).toHaveBeenCalledWith(ACCOUNT, SONG, NOTATION, "png");
		expect(blob.putBlob).toHaveBeenCalledWith(
			thumbPathname,
			Buffer.from(PNG),
			"image/png",
			"private",
		);
	});
	it("a thumbnail that is not an image, or empty, is ignored and the file is still marked ready", async () => {
		const text = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>");
		await formPost({ url, thumbnail: thumbnail(text, "image/svg+xml", "page.svg") });
		await formPost({ url, thumbnail: thumbnail(new Uint8Array(0)) });
		expect(blob.putBlob).not.toHaveBeenCalled();
		expect(data.markNotationReady).toHaveBeenCalledTimes(2);
		expect(data.markNotationReady).toHaveBeenLastCalledWith(
			ACCOUNT,
			NOTATION,
			expect.objectContaining({ thumbnailUrl: null, thumbnailPathname: null }),
		);
	});
	it("413 for a thumbnail over the ceiling, after the file passed its check and before the row is marked", async () => {
		const big = new Uint8Array(NOTATION_THUMBNAIL_MAX_BYTES + 1);
		big.set(WEBP);
		await expect(formPost({ url, thumbnail: thumbnail(big) })).rejects.toMatchObject(
			httpError(413),
		);
		expect(blob.readBlob).toHaveBeenCalledTimes(1);
		expect(blob.putBlob).not.toHaveBeenCalled();
		expect(data.markNotationReady).not.toHaveBeenCalled();
		expect(data.failNotation).not.toHaveBeenCalled();
	});
});
