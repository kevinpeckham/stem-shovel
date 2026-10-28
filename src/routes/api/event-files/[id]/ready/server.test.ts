import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import "../../../../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
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
 * Step 3 of a poster's or photo's upload: an editor reports the blob URL, a
 * thumbnail and the measured size; the server checks the stored bytes (a
 * PDF poster's `%PDF-`, an image's signature) before marking it ready,
 * removes what does not match, and removes a replaced poster's blobs.
 */
const { POST } = await import("./+server");

const EVENT = fakeId("event-one");
const FILE = fakeId("evfile-one");
const pathname = `accounts/${ACCOUNT}/events/${EVENT}/files/${FILE}.pdf`;
const url = `https://store.public.blob.vercel-storage.com/${pathname}`;
const thumbPathname = `accounts/${ACCOUNT}/events/${EVENT}/files/${FILE}.thumb-abc.webp`;
const thumbUrl = `https://store.public.blob.vercel-storage.com/${thumbPathname}`;
const fileRow = { id: FILE, kind: "poster", shareCode: "abcdefghijklmnop" };

const PDF_HEAD = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const PNG_HEAD = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const WEBP_HEAD = new Uint8Array([
	0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50,
]);

const storedBytes = (bytes: Uint8Array) =>
	blob.readBlob.mockImplementation(async () => new Response(bytes.slice().buffer));
const formPost = (fields: Record<string, string | File>) => {
	const form = new FormData();
	for (const [name, value] of Object.entries(fields)) form.append(name, value);
	return new Request(`http://localhost/api/event-files/${FILE}/ready`, {
		method: "POST",
		body: form,
	});
};
const post = (fields: Record<string, string | File> = { url }, locals = asEditorOf(ACCOUNT)) =>
	callRoute(POST, locals, formPost(fields), { id: FILE });
const thumbnail = (bytes: Uint8Array | ArrayLike<number>, name = "thumb.webp") =>
	new File([new Uint8Array(bytes)], name);
const relocate = (await import("#lib/server/relocate.js")) as unknown as Mocks;

beforeEach(() => {
	resetRemoteMocks();
	givenRow("eventFile", { accountId: ACCOUNT });
	data.findEventFileById.mockResolvedValue({ pathname, kind: "poster", filename: "Poster.pdf" });
	blob.isOurBlobUrl.mockReturnValue(true);
	storedBytes(PDF_HEAD);
	blob.fileThumbnailPathname.mockReturnValue(thumbPathname);
	blob.putBlob.mockResolvedValue({ url: thumbUrl });
	relocate.accessOfPathname.mockResolvedValue("public");
	data.markEventFileReady.mockResolvedValue({ file: fileRow, replaced: [] });
});
afterEach(() => vi.useRealTimers());

describe("POST /api/event-files/[id]/ready", () => {
	it("401 signed out, 404 for an outsider and for a viewer", async () => {
		await expect(post({ url }, asSignedOut())).rejects.toMatchObject(httpError(401));
		await expect(post({ url }, asOutsider())).rejects.toMatchObject(httpError(404));
		await expect(post({ url }, asViewerOf(ACCOUNT))).rejects.toMatchObject(httpError(404));
		expect(data.findEventFileById).not.toHaveBeenCalled();
		expect(data.markEventFileReady).not.toHaveBeenCalled();
	});
	it("400 without an https URL, before any lookup", async () => {
		await expect(post({})).rejects.toMatchObject(httpError(400));
		await expect(post({ url: "http://x" })).rejects.toMatchObject(httpError(400));
		expect(data.findEventFileById).not.toHaveBeenCalled();
	});
	it("404 for an unknown file, from the access check or the data layer", async () => {
		givenRow("eventFile", null);
		await expect(post()).rejects.toMatchObject(httpError(404));
		givenRow("eventFile", { accountId: ACCOUNT });
		data.findEventFileById.mockResolvedValue(null);
		await expect(post()).rejects.toMatchObject(httpError(404));
		expect(data.findEventFileById).toHaveBeenCalledWith(ACCOUNT, FILE);
		expect(blob.readBlob).not.toHaveBeenCalled();
	});
	it("400 when the URL is another file; the row stays", async () => {
		blob.isOurBlobUrl.mockReturnValue(false);
		await expect(post()).rejects.toMatchObject(httpError(400));
		expect(blob.isOurBlobUrl).toHaveBeenCalledWith(url, pathname);
		expect(data.failEventFile).not.toHaveBeenCalled();
	});
	it("415 when a PDF poster's bytes are not a PDF: the row and file are removed", async () => {
		storedBytes(PNG_HEAD);
		await expect(post()).rejects.toMatchObject({
			status: 415,
			body: { message: "That file does not look like a PDF" },
		});
		expect(data.failEventFile).toHaveBeenCalledWith(ACCOUNT, FILE);
		expect(data.markEventFileReady).not.toHaveBeenCalled();
	});
	it("an image poster or a photo must start like an image", async () => {
		data.findEventFileById.mockResolvedValue({
			pathname: pathname.replace(".pdf", ".png"),
			kind: "photo",
			filename: "crowd.png",
		});
		storedBytes(PDF_HEAD);
		await expect(post()).rejects.toMatchObject({
			status: 415,
			body: { message: "That file does not look like an image" },
		});
		storedBytes(PNG_HEAD);
		expect((await post()).status).toBe(200);
		expect(data.failEventFile).toHaveBeenCalledTimes(1);
	});
	it("415 when the store has nothing to read, after a second try", async () => {
		vi.useFakeTimers();
		blob.readBlob.mockRejectedValue(new Error("not there"));
		const pending = expect(post()).rejects.toMatchObject(httpError(415));
		await vi.advanceTimersByTimeAsync(2500);
		await pending;
		expect(blob.readBlob).toHaveBeenCalledTimes(2);
		expect(data.failEventFile).toHaveBeenCalledWith(ACCOUNT, FILE);
	});
	it("marks the file ready with its thumbnail and measured size, and answers the row", async () => {
		const res = await post({ url, width: "1200", height: "1800", thumbnail: thumbnail(WEBP_HEAD) });
		expect(await res.json()).toEqual({ file: fileRow });
		expect(blob.fileThumbnailPathname).toHaveBeenCalledWith(pathname, "webp");
		expect(blob.putBlob).toHaveBeenCalledWith(
			thumbPathname,
			expect.any(Buffer),
			"image/webp",
			"public",
		);
		expect(data.markEventFileReady).toHaveBeenCalledWith(ACCOUNT, FILE, {
			url,
			thumbnailUrl: thumbUrl,
			thumbnailPathname: thumbPathname,
			width: 1200,
			height: 1800,
		});
		expect(blob.deleteBlobs).not.toHaveBeenCalled();
	});
	it("a size that is not a whole positive number of pixels is none; a thumbnail that is not an image is ignored", async () => {
		await post({
			url,
			width: "0",
			height: "1.5",
			thumbnail: thumbnail(new TextEncoder().encode("GIF89a")),
		});
		expect(data.markEventFileReady).toHaveBeenCalledWith(ACCOUNT, FILE, {
			url,
			thumbnailUrl: null,
			thumbnailPathname: null,
			width: null,
			height: null,
		});
		expect(blob.putBlob).not.toHaveBeenCalled();
	});
	it("413 for a thumbnail over the cap; nothing is marked", async () => {
		const big = new Uint8Array(PDF_THUMBNAIL_MAX_BYTES + 1);
		big.set(PNG_HEAD);
		await expect(post({ url, thumbnail: thumbnail(big) })).rejects.toMatchObject(httpError(413));
		expect(data.markEventFileReady).not.toHaveBeenCalled();
	});
	it("a new poster's ready removes the blobs of the posters it replaced", async () => {
		data.markEventFileReady.mockResolvedValue({
			file: fileRow,
			replaced: [
				{
					url: "https://x/old.pdf",
					pathname: "old.pdf",
					thumbnailUrl: "https://x/old.webp",
					thumbnailPathname: "old.webp",
				},
				{
					url: "https://x/older.png",
					pathname: "older.png",
					thumbnailUrl: null,
					thumbnailPathname: null,
				},
			],
		});
		await post();
		expect(blob.deleteBlobs).toHaveBeenCalledWith([
			"https://x/old.pdf",
			"https://x/old.webp",
			"https://x/older.png",
			"",
		]);
	});
	it("404 when the data layer finds no row to mark", async () => {
		data.markEventFileReady.mockResolvedValue(null);
		await expect(post()).rejects.toMatchObject(httpError(404));
	});
});
