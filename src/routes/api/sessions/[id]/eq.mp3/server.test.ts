import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import "../../../../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
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
	resetRemoteMocks,
} from "../../../../../../tests/helpers/fakeServerModules";
import { callRoute } from "../../../../../../tests/helpers/fakeApiEvent";
import { eqFilterGraph } from "#lib/utils/eqFilterGraph.js";
import { parseEqSearchParams } from "#lib/utils/eqSearchParams.js";

/**
 * A session recording as an MP3 with the playback EQ applied: a member of
 * the account, the settings in the query. The ffmpeg renderer is stubbed.
 */
const h = vi.hoisted(() => ({ renderWithEq: vi.fn() }));
vi.mock("#lib/server/eqRender.js", () => h);

const { GET } = await import("./+server");

const RECORDING = fakeId("rec-one");
const file = {
	title: "Set one",
	filename: "set1.m4a",
	source: "",
	device: "",
	url: "https://blob/set1.m4a",
	playbackUrl: "https://blob/set1.mp3",
};
const mp3 = new Uint8Array([0xff, 0xfb, 0x90, 0x00]);
const QUERY = "?hp=1&low=3&mid=-2.5&midf=1500";
const get = (locals: FakeRequestEvent, query = QUERY) =>
	callRoute(GET, locals, new Request(`http://localhost/api/sessions/${RECORDING}/eq.mp3${query}`), {
		id: RECORDING,
	});

beforeEach(() => {
	resetRemoteMocks();
	h.renderWithEq.mockReset();
	givenRow("sessionRecording", { accountId: ACCOUNT });
	data.sessionRecordingFile.mockResolvedValue(file);
	blob.readBlob.mockResolvedValue(new Response("source"));
	h.renderWithEq.mockResolvedValue(new Response(mp3).body);
});

describe("GET /api/sessions/[id]/eq.mp3", () => {
	it("401 signed out, 404 for a member of another account", async () => {
		await expect(get(asSignedOut())).rejects.toMatchObject(httpError(401));
		await expect(get(asOutsider())).rejects.toMatchObject(httpError(404));
		expect(data.sessionRecordingFile).not.toHaveBeenCalled();
	});
	it("404 for a recording not ready or not the account's", async () => {
		data.sessionRecordingFile.mockResolvedValue(null);
		await expect(get(asEditorOf(ACCOUNT))).rejects.toMatchObject(httpError(404));
		expect(data.sessionRecordingFile).toHaveBeenCalledWith(ACCOUNT, RECORDING);
	});
	it("400 for a flat EQ, before reading the file", async () => {
		await expect(get(asEditorOf(ACCOUNT), "")).rejects.toMatchObject(httpError(400));
		await expect(get(asEditorOf(ACCOUNT), "?lowf=100")).rejects.toMatchObject(httpError(400));
		expect(blob.readBlob).not.toHaveBeenCalled();
		expect(h.renderWithEq).not.toHaveBeenCalled();
	});
	it("renders the MP3 rendition through the query's filter graph", async () => {
		await get(asEditorOf(ACCOUNT));
		expect(blob.readBlob).toHaveBeenCalledWith(file.playbackUrl);
		const graph = eqFilterGraph(parseEqSearchParams(new URLSearchParams(QUERY)));
		expect(graph).toBeTruthy();
		expect(h.renderWithEq).toHaveBeenCalledWith(expect.any(Response), graph);
	});
	it("falls back to the original without an MP3 rendition", async () => {
		data.sessionRecordingFile.mockResolvedValue({ ...file, playbackUrl: null });
		await get(asEditorOf(ACCOUNT));
		expect(blob.readBlob).toHaveBeenCalledWith(file.url);
	});
	it("streams an MP3 attachment named after the recording with (EQ), uncached", async () => {
		const res = await get(asEditorOf(ACCOUNT));
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("audio/mpeg");
		expect(res.headers.get("content-disposition")).toBe(
			`attachment; filename="set-one (EQ).mp3"; filename*=UTF-8''set-one%20(EQ).mp3`,
		);
		expect(res.headers.get("cache-control")).toBe("private, no-store");
		expect(new Uint8Array(await res.arrayBuffer())).toEqual(mp3);
	});
	it("500 when the file cannot be read or ffmpeg fails before any output", async () => {
		blob.readBlob.mockResolvedValue(new Response(null, { status: 404 }));
		await expect(get(asEditorOf(ACCOUNT))).rejects.toMatchObject(httpError(500));
		blob.readBlob.mockResolvedValue(new Response("source"));
		h.renderWithEq.mockRejectedValue(new Error("ffmpeg exited with 1"));
		vi.spyOn(console, "error").mockImplementation(() => {});
		await expect(get(asEditorOf(ACCOUNT))).rejects.toMatchObject(httpError(500));
	});
});
