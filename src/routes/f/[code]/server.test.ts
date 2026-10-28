import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../../tests/helpers/fakeServerModules";
import { asSignedOut, httpError } from "../../../../tests/helpers/fakeRequestEvent";
import { blob, data, resetRemoteMocks } from "../../../../tests/helpers/fakeServerModules";
import { callRoute } from "../../../../tests/helpers/fakeApiEvent";

/**
 * A file's permanent link: the share code finds an attachment, a notation
 * file or a show's poster or photo, in that order; the visitor is sent to
 * the store, or with `?download=1` (or `pdf`) gets the bytes under the
 * file's own name and type.
 */
const { GET } = await import("./+server");

const CODE = "abcdefghijklmnop";
const get = (query = "") =>
	callRoute(GET, asSignedOut(), new Request(`http://localhost/f/${CODE}${query}`), {
		code: CODE,
	});
const poster = {
	url: "https://store.public.blob.vercel-storage.com/accounts/a/events/e/files/p.pdf",
	filename: "Release show.pdf",
	contentType: "application/pdf",
	kind: "poster",
};
const photo = {
	url: "https://store.public.blob.vercel-storage.com/accounts/a/events/e/files/q.jpg",
	filename: "crowd.jpg",
	contentType: "image/jpeg",
	kind: "photo",
};

beforeEach(() => {
	resetRemoteMocks();
	data.fileByShareCode.mockResolvedValue(null);
	data.notationByShareCode.mockResolvedValue(null);
	data.eventFileByShareCode.mockResolvedValue(null);
	blob.presentUrl.mockImplementation(async (url: string) => url);
	blob.readBlob.mockImplementation(
		async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-length": "3" } }),
	);
});

describe("GET /f/[code]", () => {
	it("404 for a code nobody made, after trying every kind of file", async () => {
		await expect(get()).rejects.toMatchObject(httpError(404));
		expect(data.fileByShareCode).toHaveBeenCalledWith(CODE);
		expect(data.notationByShareCode).toHaveBeenCalledWith(CODE);
		expect(data.eventFileByShareCode).toHaveBeenCalledWith(CODE);
	});
	it("an attachment wins before an event file is looked up", async () => {
		data.fileByShareCode.mockResolvedValue({
			url: "https://store.public.blob.vercel-storage.com/x.pdf",
			filename: "x.pdf",
			title: "x",
			kind: "pdf",
			contentType: "application/pdf",
		});
		const res = await get();
		expect(res.status).toBe(302);
		expect(data.eventFileByShareCode).not.toHaveBeenCalled();
	});
	it("a show's poster: a redirect to the store, or its bytes under its own name and stored type", async () => {
		data.eventFileByShareCode.mockResolvedValue(poster);
		const res = await get();
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe(poster.url);
		const download = await get("?download=1");
		expect(download.status).toBe(200);
		expect(download.headers.get("content-type")).toBe("application/pdf");
		expect(download.headers.get("content-disposition")).toContain("Release show.pdf");
		expect(blob.readBlob).toHaveBeenCalledWith(poster.url);
		// A PDF poster is its own PDF.
		expect((await get("?download=pdf")).status).toBe(200);
	});
	it("a photo downloads as the image it is, and has no PDF", async () => {
		data.eventFileByShareCode.mockResolvedValue(photo);
		const download = await get("?download=1");
		expect(download.headers.get("content-type")).toBe("image/jpeg");
		expect(download.headers.get("content-disposition")).toContain("crowd.jpg");
		await expect(get("?download=pdf")).rejects.toMatchObject(httpError(404));
	});
});
