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
} from "../../../../../../tests/helpers/fakeRequestEvent";
import {
	blob,
	data,
	givenRow,
	resetRemoteMocks,
	type Mocks,
} from "../../../../../../tests/helpers/fakeServerModules";
import { callRoute } from "../../../../../../tests/helpers/fakeApiEvent";
import { PDF_THUMBNAIL_MAX_BYTES } from "#lib/constants/fileFormats.js";

/**
 * Step 3 of an attachment upload: an editor reports the blob URL (and a
 * rendered first page); the server checks the stored bytes against the
 * row's kind before marking it ready, and removes what does not match.
 */
const { POST } = await import("./+server");

const SONG = fakeId("song-one");
const PROJECT = fakeId("proj-one");
const FILE = fakeId("file-one");
const pathname = `accounts/${ACCOUNT}/songs/${SONG}/files/${FILE}.pdf`;
const url = `https://store.public.blob.vercel-storage.com/${pathname}`;
const thumbPathname = `accounts/${ACCOUNT}/songs/${SONG}/files/${FILE}.thumb-abc.png`;
const thumbUrl = `https://store.public.blob.vercel-storage.com/${thumbPathname}`;
const ready = { id: FILE, kind: "pdf", shareCode: "abcdefghijklmnop" };

/** The first bytes of each kind, as src/lib/utils/fileSignatures.ts reads them. */
const PDF_HEAD = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const PNG_HEAD = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const WEBP_HEAD = new Uint8Array([
	0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50,
]);
const ascii = (s: string) => new TextEncoder().encode(s);

/** The store answers with these bytes (a fresh Response per read: a body reads once). */
const storedBytes = (bytes: Uint8Array) =>
	blob.readBlob.mockImplementation(async () => new Response(bytes.slice().buffer));

/** A multipart request the way the browser sends it: `url`, optional `pageCount` and `thumbnail`. */
const formPost = (fields: Record<string, string | File>) => {
	const form = new FormData();
	for (const [name, value] of Object.entries(fields)) form.append(name, value);
	return new Request(`http://localhost/api/files/${FILE}/ready`, { method: "POST", body: form });
};
const post = (fields: Record<string, string | File> = { url }, locals = asEditorOf(ACCOUNT)) =>
	callRoute(POST, locals, formPost(fields), { id: FILE });
const thumbnail = (bytes: Uint8Array | ArrayLike<number>, name = "page.png") =>
	new File([new Uint8Array(bytes)], name);
/** The relocate module is auto-mocked by fakeServerModules; `accessOfPathname` answers the store the file is in. */
const relocate = (await import("#lib/server/relocate.js")) as unknown as Mocks;

beforeEach(() => {
	resetRemoteMocks();
	givenRow("songFile", { accountId: ACCOUNT, projectId: PROJECT });
	data.findFileById.mockResolvedValue({ pathname, kind: "pdf" });
	blob.isOurBlobUrl.mockReturnValue(true);
	storedBytes(PDF_HEAD);
	blob.fileThumbnailPathname.mockReturnValue(thumbPathname);
	blob.putBlob.mockResolvedValue({ url: thumbUrl });
	relocate.accessOfPathname.mockResolvedValue("public");
	data.markFileReady.mockResolvedValue(ready);
});
afterEach(() => vi.useRealTimers());

describe("POST /api/files/[id]/ready", () => {
	it("401 signed out, 404 for an outsider and for a viewer", async () => {
		await expect(post({ url }, asSignedOut())).rejects.toMatchObject(httpError(401));
		await expect(post({ url }, asOutsider())).rejects.toMatchObject(httpError(404));
		await expect(post({ url }, asViewerOf(ACCOUNT))).rejects.toMatchObject(httpError(404));
		expect(data.findFileById).not.toHaveBeenCalled();
		expect(data.markFileReady).not.toHaveBeenCalled();
	});
	it("400 without an https URL, before any lookup", async () => {
		await expect(post({})).rejects.toMatchObject(httpError(400));
		await expect(post({ url: "http://x" })).rejects.toMatchObject(httpError(400));
		expect(data.findFileById).not.toHaveBeenCalled();
	});
	it("404 for an unknown file, from the access check or the data layer", async () => {
		givenRow("songFile", null);
		await expect(post()).rejects.toMatchObject(httpError(404));
		givenRow("songFile", { accountId: ACCOUNT, projectId: PROJECT });
		data.findFileById.mockResolvedValue(null);
		await expect(post()).rejects.toMatchObject(httpError(404));
		expect(data.findFileById).toHaveBeenCalledWith(ACCOUNT, FILE);
		expect(blob.readBlob).not.toHaveBeenCalled();
	});
	it("400 when the URL is another file; the row stays", async () => {
		blob.isOurBlobUrl.mockReturnValue(false);
		await expect(post()).rejects.toMatchObject(httpError(400));
		expect(blob.isOurBlobUrl).toHaveBeenCalledWith(url, pathname);
		expect(data.failFile).not.toHaveBeenCalled();
		expect(blob.readBlob).not.toHaveBeenCalled();
	});
	it("415 when the stored bytes are not the row's kind: the row and file are removed", async () => {
		storedBytes(PNG_HEAD);
		await expect(post()).rejects.toMatchObject({
			status: 415,
			body: { message: expect.stringContaining("a PDF") },
		});
		expect(blob.readBlob).toHaveBeenCalledWith(url);
		expect(data.failFile).toHaveBeenCalledWith(ACCOUNT, FILE);
		expect(data.markFileReady).not.toHaveBeenCalled();
	});
	it("415 when the store has nothing to read, after a second try a second later", async () => {
		vi.useFakeTimers();
		blob.readBlob.mockRejectedValue(new Error("not there"));
		const pending = expect(post()).rejects.toMatchObject(httpError(415));
		await vi.advanceTimersByTimeAsync(2500);
		await pending;
		expect(blob.readBlob).toHaveBeenCalledTimes(2);
		expect(data.failFile).toHaveBeenCalledWith(ACCOUNT, FILE);
	});
	it.each([
		["image", WEBP_HEAD, PDF_HEAD],
		["audio", ascii("ID3\x04"), ascii("hello")],
		["midi", ascii("MThd\0\0"), ascii("RIFF")],
		["text", ascii("Verse 1\n"), new Uint8Array([0x56, 0x00, 0x65])],
		["other", ascii("anything"), new Uint8Array([])],
	] as const)("checks a %s file by its first bytes", async (kind, good, bad) => {
		data.findFileById.mockResolvedValue({ pathname, kind });
		data.markFileReady.mockResolvedValue({ ...ready, kind });
		storedBytes(bad);
		await expect(post()).rejects.toMatchObject(httpError(415));
		storedBytes(good);
		const res = await post();
		expect(await res.json()).toEqual({ ok: true, shareCode: ready.shareCode, kind });
		expect(data.failFile).toHaveBeenCalledTimes(1);
	});
	it("404 when the data layer finds no row to mark", async () => {
		data.markFileReady.mockResolvedValue(null);
		await expect(post()).rejects.toMatchObject(httpError(404));
	});
	it("marks the file ready with no page count or thumbnail when none were sent", async () => {
		const res = await post();
		expect(await res.json()).toEqual({ ok: true, shareCode: ready.shareCode, kind: "pdf" });
		expect(data.markFileReady).toHaveBeenCalledWith(ACCOUNT, FILE, {
			url,
			pageCount: null,
			thumbnailUrl: null,
			thumbnailPathname: null,
		});
		expect(blob.putBlob).not.toHaveBeenCalled();
		expect(data.failFile).not.toHaveBeenCalled();
	});
	it("keeps a page count that is a whole number from 1 up to 9999, else none", async () => {
		await post({ url, pageCount: "12" });
		expect(data.markFileReady).toHaveBeenLastCalledWith(
			ACCOUNT,
			FILE,
			expect.objectContaining({ pageCount: 12 }),
		);
		for (const pageCount of ["0", "-1", "1.5", "10000", "abc"]) {
			await post({ url, pageCount });
			expect(data.markFileReady).toHaveBeenLastCalledWith(
				ACCOUNT,
				FILE,
				expect.objectContaining({ pageCount: null }),
			);
		}
	});
	it("stores a PNG thumbnail beside the file in the file's store", async () => {
		const res = await post({ url, pageCount: "3", thumbnail: thumbnail(PNG_HEAD) });
		expect(await res.json()).toEqual({ ok: true, shareCode: ready.shareCode, kind: "pdf" });
		expect(blob.fileThumbnailPathname).toHaveBeenCalledWith(pathname, "png");
		expect(relocate.accessOfPathname).toHaveBeenCalledWith(pathname);
		expect(blob.putBlob).toHaveBeenCalledWith(
			thumbPathname,
			expect.any(Buffer),
			"image/png",
			"public",
		);
		expect(new Uint8Array(blob.putBlob.mock.calls[0][1] as Buffer)).toEqual(PNG_HEAD);
		expect(data.markFileReady).toHaveBeenCalledWith(ACCOUNT, FILE, {
			url,
			pageCount: 3,
			thumbnailUrl: thumbUrl,
			thumbnailPathname: thumbPathname,
		});
	});
	it("a WebP thumbnail is stored as .webp, in a private store when the file is private", async () => {
		relocate.accessOfPathname.mockResolvedValue("private");
		await post({ url, thumbnail: thumbnail(WEBP_HEAD, "page.webp") });
		expect(blob.fileThumbnailPathname).toHaveBeenCalledWith(pathname, "webp");
		expect(blob.putBlob).toHaveBeenCalledWith(
			thumbPathname,
			expect.any(Buffer),
			"image/webp",
			"private",
		);
	});
	it("a thumbnail that is not a PNG or WebP, or is empty, is ignored, not refused", async () => {
		await post({ url, thumbnail: thumbnail(ascii("GIF89a")) });
		await post({ url, thumbnail: thumbnail([]) });
		await post({ url, thumbnail: "not-a-file" });
		expect(blob.putBlob).not.toHaveBeenCalled();
		expect(data.markFileReady).toHaveBeenCalledTimes(3);
		for (const call of data.markFileReady.mock.calls)
			expect(call[2]).toMatchObject({ thumbnailUrl: null, thumbnailPathname: null });
	});
	it("413 for a thumbnail over the cap, after the file itself passed; nothing is stored or marked", async () => {
		const big = new Uint8Array(PDF_THUMBNAIL_MAX_BYTES + 1);
		big.set(PNG_HEAD);
		await expect(post({ url, thumbnail: thumbnail(big) })).rejects.toMatchObject(httpError(413));
		expect(blob.readBlob).toHaveBeenCalledTimes(1);
		expect(blob.putBlob).not.toHaveBeenCalled();
		expect(data.markFileReady).not.toHaveBeenCalled();
		expect(data.failFile).not.toHaveBeenCalled();
	});
	it("an admin passes without the project lookup", async () => {
		const res = await post({ url }, asAdminOf(ACCOUNT));
		expect(res.status).toBe(200);
	});
});
