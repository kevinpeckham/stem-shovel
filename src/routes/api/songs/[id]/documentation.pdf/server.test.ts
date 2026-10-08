import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import "../../../../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	OTHER_USER,
	USER,
	asAdminOf,
	asEditorOf,
	asOutsider,
	asSignedOut,
	asViewerOf,
	fakeId,
	httpError,
	type FakeRequestEvent,
} from "../../../../../../tests/helpers/fakeRequestEvent";
import { data, resetRemoteMocks } from "../../../../../../tests/helpers/fakeServerModules";
import { callRoute } from "../../../../../../tests/helpers/fakeApiEvent";

/**
 * A song's lyrics, chart, notes and notation as one PDF: viewable like the
 * song itself (public by URL, share codes, restricted projects), a 404 when
 * there is nothing to put in. The documentation module (pdfkit) is stubbed.
 */
const h = vi.hoisted(() => ({
	hasDocumentation: vi.fn(),
	notationPartsOf: vi.fn(),
	songDocumentationPdf: vi.fn(),
}));
vi.mock("#lib/server/documentation.js", () => h);

const { GET } = await import("./+server");

const SONG = fakeId("song-one");
const PROJECT = fakeId("proj-one");
const song = {
	id: SONG,
	accountId: ACCOUNT,
	projectId: PROJECT,
	isPrivate: false,
	title: "Song One",
	version: "2",
	lyricsMarkdown: "la la",
	chartMarkdown: "",
	notesMarkdown: "",
	project: { name: "Spring Set", isPrivate: false, isRestricted: false },
	notation: [{ id: fakeId("notation-one"), pdfUrl: "https://x/score.pdf", pdfStatus: "ready" }],
	files: [],
};
const parts = [{ kind: "pdf", bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]) }];
const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
const request = (query = "") =>
	new Request(`http://localhost/api/songs/${SONG}/documentation.pdf${query}`);
const get = (locals: FakeRequestEvent = asSignedOut(), query = "") =>
	callRoute(GET, locals, request(query), { id: SONG });

beforeEach(() => {
	resetRemoteMocks();
	data.songForDocumentation.mockResolvedValue(song);
	h.notationPartsOf.mockResolvedValue(parts);
	h.hasDocumentation.mockReturnValue(true);
	h.songDocumentationPdf.mockResolvedValue(pdf);
});

describe("GET /api/songs/[id]/documentation.pdf", () => {
	it("404 for an unknown song", async () => {
		data.songForDocumentation.mockResolvedValue(null);
		await expect(get()).rejects.toMatchObject(httpError(404));
		expect(data.songForDocumentation).toHaveBeenCalledWith(SONG);
		expect(h.songDocumentationPdf).not.toHaveBeenCalled();
	});
	it("a public song downloads for anyone, signed out, without a role lookup", async () => {
		const res = await get(asSignedOut());
		expect(res.status).toBe(200);
		expect(data.projectRoleOf).not.toHaveBeenCalled();
		expect(data.openShareLinks).toHaveBeenCalledWith([]);
	});
	it("403 for a private song to a stranger, signed in or not", async () => {
		data.songForDocumentation.mockResolvedValue({ ...song, isPrivate: true });
		await expect(get(asSignedOut())).rejects.toMatchObject(httpError(403));
		await expect(get(asOutsider())).rejects.toMatchObject(httpError(403));
		expect(data.projectRoleOf).toHaveBeenCalledWith(PROJECT, OTHER_USER);
		expect(h.notationPartsOf).not.toHaveBeenCalled();
	});
	it("a public song in a private project is private too", async () => {
		data.songForDocumentation.mockResolvedValue({
			...song,
			project: { ...song.project, isPrivate: true },
		});
		await expect(get(asSignedOut())).rejects.toMatchObject(httpError(403));
	});
	it("a private song downloads for the account's viewers and for a project viewer from outside", async () => {
		data.songForDocumentation.mockResolvedValue({ ...song, isPrivate: true });
		expect((await get(asViewerOf(ACCOUNT))).status).toBe(200);
		data.projectRoleOf.mockResolvedValue("viewer");
		expect((await get(asOutsider())).status).toBe(200);
	});
	it("a restricted project closes its songs to a member not added to it, not to one who was or to an admin", async () => {
		data.songForDocumentation.mockResolvedValue({
			...song,
			project: { ...song.project, isRestricted: true },
		});
		await expect(get(asEditorOf(ACCOUNT))).rejects.toMatchObject(httpError(403));
		expect(data.projectRoleOf).toHaveBeenCalledWith(PROJECT, USER);
		data.projectRoleOf.mockResolvedValue("member");
		expect((await get(asEditorOf(ACCOUNT))).status).toBe(200);
		data.projectRoleOf.mockResolvedValue(null);
		expect((await get(asAdminOf(ACCOUNT))).status).toBe(200);
	});
	it("a share code for the song or its project, in the query or the cookie, opens a private song", async () => {
		data.songForDocumentation.mockResolvedValue({ ...song, isPrivate: true });
		data.openShareLinks.mockResolvedValue([{ code: "CODE", projectId: null, songId: SONG }]);
		expect((await get(asSignedOut(), "?share=CODE")).status).toBe(200);
		expect(data.openShareLinks).toHaveBeenCalledWith(["CODE"]);
		data.openShareLinks.mockResolvedValue([{ code: "PROJ", projectId: PROJECT, songId: null }]);
		const visitor = asSignedOut();
		visitor.cookies.get.mockReturnValue("PROJ");
		expect((await get(visitor)).status).toBe(200);
		expect(data.openShareLinks).toHaveBeenLastCalledWith(["PROJ"]);
	});
	it("a share code for another song does not open this one", async () => {
		data.songForDocumentation.mockResolvedValue({ ...song, isPrivate: true });
		data.openShareLinks.mockResolvedValue([
			{ code: "CODE", projectId: null, songId: fakeId("song-two") },
		]);
		await expect(get(asSignedOut(), "?share=CODE")).rejects.toMatchObject(httpError(403));
	});
	it("404 when the song has no text and no notation to merge", async () => {
		h.notationPartsOf.mockResolvedValue([]);
		h.hasDocumentation.mockReturnValue(false);
		await expect(get()).rejects.toMatchObject(httpError(404));
		expect(h.notationPartsOf).toHaveBeenCalledWith(song);
		expect(h.hasDocumentation).toHaveBeenCalledWith(song, 0);
		expect(h.songDocumentationPdf).not.toHaveBeenCalled();
	});
	it("the PDF is built from the song, its project's name and its notation, sent as an attachment named after the song, uncached", async () => {
		const res = await get(asEditorOf(ACCOUNT));
		expect(res.status).toBe(200);
		expect(h.hasDocumentation).toHaveBeenCalledWith(song, 1);
		expect(h.songDocumentationPdf).toHaveBeenCalledWith(
			{ ...song, projectName: "Spring Set" },
			parts,
		);
		expect(res.headers.get("content-type")).toBe("application/pdf");
		expect(res.headers.get("content-length")).toBe("6");
		expect(res.headers.get("content-disposition")).toBe(
			`attachment; filename="Song One.pdf"; filename*=UTF-8''Song%20One.pdf`,
		);
		expect(res.headers.get("cache-control")).toBe("private, no-store");
		expect(new Uint8Array(await res.arrayBuffer())).toEqual(pdf);
	});
	it("a title with quotes and accents gets an ASCII stand-in and the real name encoded", async () => {
		data.songForDocumentation.mockResolvedValue({ ...song, title: 'Café "Live"' });
		const res = await get();
		expect(res.headers.get("content-disposition")).toBe(
			`attachment; filename="Caf_ _Live_.pdf"; filename*=UTF-8''Caf%C3%A9%20_Live_.pdf`,
		);
	});
});
