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
 * A song's chord chart as MusicXML: viewable like the song itself (public
 * by URL, share codes, restricted projects), a 404 when the chart is blank
 * or will not export. The export itself is stubbed; `chartMusicXml.test.ts`
 * covers it.
 */
const h = vi.hoisted(() => ({ chartMusicXml: vi.fn() }));
vi.mock("#lib/utils/chartMusicXml.js", () => h);

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
	lyricsMarkdown: "",
	chartMarkdown: "| C | F |",
	notesMarkdown: "",
	project: { name: "Spring Set", isPrivate: false, isRestricted: false },
	notation: [],
	files: [],
};
const XML = '<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"></score-partwise>';
const request = (query = "") =>
	new Request(`http://localhost/api/songs/${SONG}/chart.musicxml${query}`);
const get = (locals: FakeRequestEvent = asSignedOut(), query = "") =>
	callRoute(GET, locals, request(query), { id: SONG });

beforeEach(() => {
	resetRemoteMocks();
	data.songForDocumentation.mockResolvedValue(song);
	h.chartMusicXml.mockReturnValue(XML);
});

describe("GET /api/songs/[id]/chart.musicxml", () => {
	it("404 for an unknown song", async () => {
		data.songForDocumentation.mockResolvedValue(null);
		await expect(get()).rejects.toMatchObject(httpError(404));
		expect(data.songForDocumentation).toHaveBeenCalledWith(SONG);
		expect(h.chartMusicXml).not.toHaveBeenCalled();
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
		expect(h.chartMusicXml).not.toHaveBeenCalled();
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
	it("404 when the chart is blank or will not export, saying what to fix", async () => {
		h.chartMusicXml.mockReturnValue(null);
		await expect(get()).rejects.toMatchObject({
			status: 404,
			body: { message: expect.stringContaining("no chart to export yet") },
		});
		expect(h.chartMusicXml).toHaveBeenCalledWith("| C | F |", "Song One");
	});
	it("the XML is written from the chart and the title, sent as a MusicXML attachment named after the song, uncached", async () => {
		const res = await get(asEditorOf(ACCOUNT));
		expect(res.status).toBe(200);
		expect(h.chartMusicXml).toHaveBeenCalledWith("| C | F |", "Song One");
		expect(res.headers.get("content-type")).toBe(
			"application/vnd.recordare.musicxml+xml; charset=utf-8",
		);
		expect(res.headers.get("content-disposition")).toContain('filename="Song One.musicxml"');
		expect(res.headers.get("content-length")).toBe(String(XML.length));
		expect(res.headers.get("cache-control")).toBe("private, no-store");
		expect(await res.text()).toBe(XML);
	});
});
