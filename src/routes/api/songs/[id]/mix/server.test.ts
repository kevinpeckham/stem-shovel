import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import "../../../../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	USER,
	asEditorOf,
	asOutsider,
	asSignedOut,
	asViewerOf,
	fakeId,
	httpError,
	type FakeRequestEvent,
} from "../../../../../../tests/helpers/fakeRequestEvent";
import {
	data,
	givenRow,
	rateLimited,
	resetRemoteMocks,
} from "../../../../../../tests/helpers/fakeServerModules";
import { callRoute } from "../../../../../../tests/helpers/fakeApiEvent";

/**
 * The MP3 mixdown: viewable like the song itself, the original served from
 * the cache, a custom mix rendered and rate-limited per caller. The mix
 * module (ffmpeg) is stubbed; its request parsing has its own tests.
 */
const h = vi.hoisted(() => ({
	parseMixRequest: vi.fn(),
	isOriginal: vi.fn(),
	originalMix: vi.fn(),
	renderMix: vi.fn(),
}));
vi.mock("$lib/server/mix", () => h);

const { GET } = await import("./+server");

const SONG = fakeId("song-one");
const PROJECT = fakeId("proj-one");
const song = {
	id: SONG,
	accountId: ACCOUNT,
	projectId: PROJECT,
	isPrivate: false,
	slug: "song",
	project: { slug: "proj", isPrivate: false, isRestricted: false },
	stems: [{ id: fakeId("stem-one"), status: "ready" }],
};
const request = (query = "") => new Request(`http://localhost/api/songs/${SONG}/mix${query}`);
const get = (locals: FakeRequestEvent = asEditorOf(ACCOUNT), query = "") =>
	callRoute(GET, locals, request(query), { id: SONG });

beforeEach(() => {
	resetRemoteMocks();
	data.songForMix.mockResolvedValue(song);
	givenRow("song", { accountId: ACCOUNT });
	h.parseMixRequest.mockReturnValue({ stems: [{ id: song.stems[0].id, gain: 1 }], master: 1 });
	h.isOriginal.mockReturnValue(true);
	h.originalMix.mockResolvedValue(Buffer.from("original"));
	h.renderMix.mockResolvedValue(Buffer.from("custom"));
	rateLimited.mockResolvedValue(false);
});

describe("GET /api/songs/[id]/mix", () => {
	it("404 for a song without stems or that does not exist", async () => {
		data.songForMix.mockResolvedValue({ ...song, stems: [] });
		await expect(get()).rejects.toMatchObject(httpError(404));
		data.songForMix.mockResolvedValue(null);
		await expect(get()).rejects.toMatchObject(httpError(404));
	});
	it("403 for a private song to a stranger, signed in or not", async () => {
		data.songForMix.mockResolvedValue({ ...song, isPrivate: true });
		await expect(get(asSignedOut())).rejects.toMatchObject(httpError(403));
		await expect(get(asOutsider())).rejects.toMatchObject(httpError(403));
		expect(h.originalMix).not.toHaveBeenCalled();
	});
	it("a private song plays for the account's viewers and for a project viewer", async () => {
		data.songForMix.mockResolvedValue({ ...song, isPrivate: true });
		expect((await get(asViewerOf(ACCOUNT))).status).toBe(200);
		data.projectRoleOf.mockResolvedValue("viewer");
		expect((await get(asOutsider())).status).toBe(200);
		expect(data.projectRoleOf).toHaveBeenCalledWith(PROJECT, expect.any(String));
	});
	it("a share code in the query opens a private song to anyone", async () => {
		data.songForMix.mockResolvedValue({ ...song, isPrivate: true });
		data.openShareLinks.mockResolvedValue([{ code: "CODE", projectId: null, songId: SONG }]);
		expect((await get(asSignedOut(), "?share=CODE")).status).toBe(200);
		expect(data.openShareLinks).toHaveBeenCalledWith(["CODE"]);
	});
	it("a public song plays for anyone", async () => {
		expect((await get(asSignedOut())).status).toBe(200);
	});
	it("400 when the query is not a mix of this song", async () => {
		h.parseMixRequest.mockReturnValue(null);
		await expect(get(asEditorOf(ACCOUNT), "?stems=nope:1")).rejects.toMatchObject(httpError(400));
	});
	it("the original comes from the cache, unlimited, as an attachment", async () => {
		const res = await get();
		expect(h.originalMix).toHaveBeenCalledWith(song, ACCOUNT);
		expect(h.renderMix).not.toHaveBeenCalled();
		expect(rateLimited).not.toHaveBeenCalled();
		expect(res.headers.get("content-type")).toBe("audio/mpeg");
		expect(res.headers.get("content-length")).toBe("8");
		expect(res.headers.get("content-disposition")).toBe('attachment; filename="proj-song-mix.mp3"');
		expect(res.headers.get("cache-control")).toBe("no-store");
		expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("original");
	});
	it("a custom mix renders, counted against the signed-in user", async () => {
		h.isOriginal.mockReturnValue(false);
		const res = await get(asEditorOf(ACCOUNT), "?stems=x:0.5");
		expect(h.renderMix).toHaveBeenCalledWith(song, h.parseMixRequest.mock.results[0].value);
		expect(rateLimited).toHaveBeenCalledWith(`mix:${USER}`, 20, 3_600_000);
		expect(res.headers.get("content-disposition")).toBe(
			'attachment; filename="proj-song-custom-mix.mp3"',
		);
	});
	it("a custom mix from a visitor is counted by address", async () => {
		h.isOriginal.mockReturnValue(false);
		await get(asSignedOut(), "?stems=x:0.5");
		expect(rateLimited).toHaveBeenCalledWith("mix:203.0.113.7", 20, 3_600_000);
	});
	it("429 once the caller's hour is spent", async () => {
		h.isOriginal.mockReturnValue(false);
		rateLimited.mockResolvedValue(true);
		await expect(get(asEditorOf(ACCOUNT), "?stems=x:0.5")).rejects.toMatchObject(httpError(429));
		expect(h.renderMix).not.toHaveBeenCalled();
	});
});
