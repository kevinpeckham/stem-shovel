import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../../../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	asEditorOf,
	asOutsider,
	asSignedOut,
	asViewerOf,
	fakeId,
	httpError,
} from "../../../../../../../tests/helpers/fakeRequestEvent";
import {
	blob,
	data,
	givenRow,
	jobs,
	notifications,
	resetRemoteMocks,
} from "../../../../../../../tests/helpers/fakeServerModules";
import { callRoute, jsonPost } from "../../../../../../../tests/helpers/fakeApiEvent";

/** Step 3 of a MIDI upload: an editor reports the blob URL; the stem's MIDI file is set, nothing else follows. */
const { POST } = await import("./+server");

const SONG = fakeId("song-one");
const PROJECT = fakeId("proj-one");
const STEM = fakeId("stem-one");
const pathname = `accounts/${ACCOUNT}/songs/${SONG}/${STEM}.mid`;
const url = `https://store.public.blob.vercel-storage.com/${pathname}`;
const body = { url };
const post = (b: unknown = body, locals = asEditorOf(ACCOUNT)) =>
	callRoute(POST, locals, jsonPost(`/api/stems/${STEM}/midi/ready`, b), { id: STEM });

beforeEach(() => {
	resetRemoteMocks();
	givenRow("stem", { accountId: ACCOUNT, song: { projectId: PROJECT } });
	data.reservedPathname.mockResolvedValue(pathname);
	blob.isOurBlobUrl.mockReturnValue(true);
	data.markStemMidiReady.mockResolvedValue({ stemId: STEM });
});

describe("POST /api/stems/[id]/midi/ready", () => {
	it("401 signed out, 404 for an outsider and for a viewer", async () => {
		await expect(post(body, asSignedOut())).rejects.toMatchObject(httpError(401));
		await expect(post(body, asOutsider())).rejects.toMatchObject(httpError(404));
		await expect(post(body, asViewerOf(ACCOUNT))).rejects.toMatchObject(httpError(404));
		expect(data.markStemMidiReady).not.toHaveBeenCalled();
	});
	it("400 without an https URL", async () => {
		await expect(post({})).rejects.toMatchObject(httpError(400));
		await expect(post({ url: "http://x" })).rejects.toMatchObject(httpError(400));
		await expect(post({ url: 42 })).rejects.toMatchObject(httpError(400));
	});
	it("404 for an unknown stem", async () => {
		givenRow("stem", null);
		await expect(post()).rejects.toMatchObject(httpError(404));
	});
	it("400 when no MIDI pathname was reserved or the URL is another file", async () => {
		data.reservedPathname.mockResolvedValue(null);
		await expect(post()).rejects.toMatchObject(httpError(400));
		data.reservedPathname.mockResolvedValue(pathname);
		blob.isOurBlobUrl.mockReturnValue(false);
		await expect(post()).rejects.toMatchObject(httpError(400));
		expect(data.reservedPathname).toHaveBeenCalledWith(ACCOUNT, "midi", STEM);
		expect(blob.isOurBlobUrl).toHaveBeenCalledWith(url, pathname);
		expect(data.markStemMidiReady).not.toHaveBeenCalled();
	});
	it("404 when the data layer finds no row to mark", async () => {
		data.markStemMidiReady.mockResolvedValue(null);
		await expect(post()).rejects.toMatchObject(httpError(404));
	});
	it("marks the MIDI file ready with the URL; no rendition, no notification", async () => {
		const res = await post();
		expect(await res.json()).toEqual({ ok: true });
		expect(data.reservedPathname).toHaveBeenCalledWith(ACCOUNT, "midi", STEM);
		expect(data.markStemMidiReady).toHaveBeenCalledWith(ACCOUNT, STEM, url);
		expect(jobs.schedulePlayback).not.toHaveBeenCalled();
		expect(notifications.notifyStems).not.toHaveBeenCalled();
	});
});
