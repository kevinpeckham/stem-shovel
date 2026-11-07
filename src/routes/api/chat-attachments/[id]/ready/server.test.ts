import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import "../../../../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	OTHER_USER,
	USER,
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
} from "../../../../../../tests/helpers/fakeServerModules";
import { callRoute } from "../../../../../../tests/helpers/fakeApiEvent";

/**
 * Step 3 of a chat attachment's upload (docs/chat.md, "Attachments"): the
 * uploader reports the blob URL, a thumbnail and the measured size; the
 * server checks the stored bytes against the row's kind before marking it
 * ready, and removes what does not match.
 */
const { POST } = await import("./+server");

const FILE = fakeId("chatfile-one");
const pathname = `accounts/${ACCOUNT}/chat/${FILE}.png`;
const url = `https://store.public.blob.vercel-storage.com/${pathname}`;
const thumbPathname = `accounts/${ACCOUNT}/chat/${FILE}.thumb-abc.webp`;
const thumbUrl = `https://store.public.blob.vercel-storage.com/${thumbPathname}`;
const attachment = { id: FILE, kind: "image", shareCode: "abcdefghijklmnop" };
const row = { pathname, kind: "image", status: "uploading", uploadedBy: USER };

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
	return new Request(`http://localhost/api/chat-attachments/${FILE}/ready`, {
		method: "POST",
		body: form,
	});
};
const post = (fields: Record<string, string | File> = { url }, locals = asViewerOf(ACCOUNT)) =>
	callRoute(POST, locals, formPost(fields), { id: FILE });

beforeEach(() => {
	resetRemoteMocks();
	givenRow("chatAttachment", { accountId: ACCOUNT, song: null });
	data.findChatAttachmentById.mockResolvedValue(row);
	blob.isOurBlobUrl.mockReturnValue(true);
	storedBytes(PNG_HEAD);
	blob.fileThumbnailPathname.mockReturnValue(thumbPathname);
	blob.putBlob.mockResolvedValue({ url: thumbUrl });
	data.markChatAttachmentReady.mockResolvedValue(attachment);
});
afterEach(() => vi.useRealTimers());

describe("POST /api/chat-attachments/[id]/ready", () => {
	it("401 signed out, 404 for an outsider", async () => {
		await expect(post({ url }, asSignedOut())).rejects.toMatchObject(httpError(401));
		await expect(post({ url }, asOutsider())).rejects.toMatchObject(httpError(404));
		expect(data.findChatAttachmentById).not.toHaveBeenCalled();
	});
	it("400 without an https URL, before any lookup", async () => {
		await expect(post({})).rejects.toMatchObject(httpError(400));
		expect(data.findChatAttachmentById).not.toHaveBeenCalled();
	});
	it("404 for an unknown file, from the access check or the data layer", async () => {
		givenRow("chatAttachment", null);
		await expect(post()).rejects.toMatchObject(httpError(404));
		givenRow("chatAttachment", { accountId: ACCOUNT, song: null });
		data.findChatAttachmentById.mockResolvedValue(null);
		await expect(post()).rejects.toMatchObject(httpError(404));
		expect(data.findChatAttachmentById).toHaveBeenCalledWith(ACCOUNT, FILE);
	});
	it("403 for someone else's file, or one already ready; nothing is read or removed", async () => {
		data.findChatAttachmentById.mockResolvedValue({ ...row, uploadedBy: OTHER_USER });
		await expect(post()).rejects.toMatchObject(httpError(403));
		data.findChatAttachmentById.mockResolvedValue({ ...row, status: "ready" });
		await expect(post()).rejects.toMatchObject(httpError(403));
		expect(blob.readBlob).not.toHaveBeenCalled();
		expect(data.failChatAttachment).not.toHaveBeenCalled();
	});
	it("400 when the URL is another file; the row stays", async () => {
		blob.isOurBlobUrl.mockReturnValue(false);
		await expect(post()).rejects.toMatchObject(httpError(400));
		expect(blob.isOurBlobUrl).toHaveBeenCalledWith(url, pathname);
		expect(data.failChatAttachment).not.toHaveBeenCalled();
	});
	it("415 when the bytes are not the row's kind: the row and file are removed", async () => {
		storedBytes(PDF_HEAD);
		await expect(post()).rejects.toMatchObject({
			status: 415,
			body: { message: "That file does not look like an image" },
		});
		expect(data.failChatAttachment).toHaveBeenCalledWith(ACCOUNT, FILE);
		expect(data.markChatAttachmentReady).not.toHaveBeenCalled();
	});
	it("415 when the store has nothing to read, after a second try", async () => {
		vi.useFakeTimers();
		blob.readBlob.mockRejectedValue(new Error("not there"));
		const pending = expect(post()).rejects.toMatchObject(httpError(415));
		await vi.advanceTimersByTimeAsync(2500);
		await pending;
		expect(data.failChatAttachment).toHaveBeenCalledWith(ACCOUNT, FILE);
	});
	it("'other' needs only bytes", async () => {
		data.findChatAttachmentById.mockResolvedValue({ ...row, kind: "other" });
		storedBytes(PDF_HEAD);
		expect((await post()).status).toBe(200);
	});
	it("marks the file ready with its thumbnail and measured size, and answers the row", async () => {
		const res = await post({
			url,
			width: "1200",
			height: "800",
			thumbnail: new File([WEBP_HEAD], "thumb.webp"),
		});
		expect(await res.json()).toEqual({ attachment });
		expect(data.markChatAttachmentReady).toHaveBeenCalledWith(ACCOUNT, FILE, {
			url,
			thumbnailUrl: thumbUrl,
			thumbnailPathname: thumbPathname,
			width: 1200,
			height: 800,
		});
	});
	it("a size that is not a whole positive number of pixels is none", async () => {
		await post({ url, width: "0", height: "1.5" });
		expect(data.markChatAttachmentReady).toHaveBeenCalledWith(ACCOUNT, FILE, {
			url,
			thumbnailUrl: null,
			thumbnailPathname: null,
			width: null,
			height: null,
		});
	});
	it("404 when the data layer finds no row to mark", async () => {
		data.markChatAttachmentReady.mockResolvedValue(null);
		await expect(post()).rejects.toMatchObject(httpError(404));
	});
});
