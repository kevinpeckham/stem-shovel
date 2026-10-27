import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	USER,
	asEditorOf,
	asOutsider,
	asSignedOut,
	fakeId,
	httpError,
	type FakeRequestEvent,
} from "../../../../../../tests/helpers/fakeRequestEvent";
import {
	blob,
	data,
	givenRow,
	rateLimited,
	resetRemoteMocks,
} from "../../../../../../tests/helpers/fakeServerModules";
import { callRoute } from "../../../../../../tests/helpers/fakeApiEvent";

/**
 * A session's MP3s in one zip: a member of the account, or a visitor
 * holding the session's share link (rate-limited); anyone else a 404.
 */
const { GET } = await import("./+server");

const SESSION = fakeId("ses-one");
const found = {
	session: { id: SESSION, kind: "show", name: "Friday", place: "", startsOn: "2026-10-17" },
	recordings: [
		{
			id: fakeId("rec-one"),
			title: "Set one",
			source: "",
			device: "",
			filename: "set1.m4a",
			playbackUrl: "https://blob/set1.mp3",
		},
	],
};
const get = (locals: FakeRequestEvent, query = "") =>
	callRoute(
		GET,
		locals,
		new Request(`http://localhost/api/recording-sessions/${SESSION}/mp3.zip${query}`),
		{ id: SESSION },
	);
const sessionGrant = { code: "CODE", projectId: null, songId: null, sessionId: SESSION };

beforeEach(() => {
	resetRemoteMocks();
	givenRow("recordingSession", { accountId: ACCOUNT });
	data.sessionMp3s.mockResolvedValue(found);
	blob.readBlob.mockImplementation(async () => new Response("mp3"));
	rateLimited.mockResolvedValue(false);
});

describe("GET /api/recording-sessions/[id]/mp3.zip", () => {
	it("404 for a session that does not exist", async () => {
		givenRow("recordingSession", null);
		await expect(get(asEditorOf(ACCOUNT))).rejects.toMatchObject(httpError(404));
		expect(data.sessionMp3s).not.toHaveBeenCalled();
	});
	it("404 to a stranger, signed in or not, and to a recording's link", async () => {
		await expect(get(asSignedOut())).rejects.toMatchObject(httpError(404));
		await expect(get(asOutsider())).rejects.toMatchObject(httpError(404));
		data.openShareLinks.mockResolvedValue([
			{ code: "R", projectId: null, songId: null, recordingId: found.recordings[0].id },
		]);
		await expect(get(asSignedOut(), "?share=R")).rejects.toMatchObject(httpError(404));
		expect(data.sessionMp3s).not.toHaveBeenCalled();
	});
	it("a member downloads it, not rate-limited", async () => {
		const res = await get(asEditorOf(ACCOUNT));
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("application/zip");
		expect(data.sessionMp3s).toHaveBeenCalledWith(ACCOUNT, SESSION);
		expect(rateLimited).not.toHaveBeenCalled();
		await res.arrayBuffer();
		expect(blob.readBlob).toHaveBeenCalledWith("https://blob/set1.mp3");
	});
	it("a visitor holding the session's link downloads it, rate-limited per caller", async () => {
		data.openShareLinks.mockResolvedValue([sessionGrant]);
		const res = await get(asSignedOut(), "?share=CODE");
		expect(res.status).toBe(200);
		expect(data.openShareLinks).toHaveBeenCalledWith(["CODE"]);
		expect(rateLimited).toHaveBeenCalledWith("sessionzip:203.0.113.7", 10, expect.any(Number));
		await get(asOutsider(USER), "?share=CODE");
		expect(rateLimited).toHaveBeenLastCalledWith(`sessionzip:${USER}`, 10, expect.any(Number));
	});
	it("429 past the visitor's limit", async () => {
		data.openShareLinks.mockResolvedValue([sessionGrant]);
		rateLimited.mockResolvedValue(true);
		await expect(get(asSignedOut(), "?share=CODE")).rejects.toMatchObject(httpError(429));
		expect(data.sessionMp3s).not.toHaveBeenCalled();
	});
	it("404 while no MP3 is ready", async () => {
		data.sessionMp3s.mockResolvedValue({ ...found, recordings: [] });
		await expect(get(asEditorOf(ACCOUNT))).rejects.toMatchObject(httpError(404));
	});
});
