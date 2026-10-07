import { beforeEach, describe, expect, it } from "vite-plus/test";
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
} from "../../../../../../tests/helpers/fakeRequestEvent";
import {
	background,
	blob,
	data,
	givenRow,
	jobs,
	notifications,
	resetRemoteMocks,
} from "../../../../../../tests/helpers/fakeServerModules";
import { callRoute, jsonPost } from "../../../../../../tests/helpers/fakeApiEvent";

/** Step 3 of a stem upload: an editor reports what the browser decoded; the rendition and the notifications follow. */
const { POST } = await import("./+server");

const SONG = fakeId("song-one");
const PROJECT = fakeId("proj-one");
const STEM = fakeId("stem-one");
const pathname = `accounts/${ACCOUNT}/songs/${SONG}/${STEM}.wav`;
const url = `https://store.public.blob.vercel-storage.com/${pathname}`;
const body = { url, durationSeconds: 180.5, channels: 2, peaks: [0, 0.25, 1] };
const post = (b: unknown = body, locals = asEditorOf(ACCOUNT)) =>
	callRoute(POST, locals, jsonPost(`/api/stems/${STEM}/ready`, b), { id: STEM });

beforeEach(() => {
	resetRemoteMocks();
	givenRow("stem", { accountId: ACCOUNT, song: { projectId: PROJECT } });
	data.reservedPathname.mockResolvedValue(pathname);
	blob.isOurBlobUrl.mockReturnValue(true);
	data.markStemReady.mockResolvedValue({ id: STEM, songId: SONG });
});

describe("POST /api/stems/[id]/ready", () => {
	it("404 signed out, for an outsider and for a viewer", async () => {
		await expect(post(body, asSignedOut())).rejects.toMatchObject(httpError(404));
		await expect(post(body, asOutsider())).rejects.toMatchObject(httpError(404));
		await expect(post(body, asViewerOf(ACCOUNT))).rejects.toMatchObject(httpError(404));
		expect(data.markStemReady).not.toHaveBeenCalled();
	});
	it("400 on a bad body: no https URL, missing numbers, peaks outside 0..1 or too many", async () => {
		await expect(post({ ...body, url: "http://x" })).rejects.toMatchObject(httpError(400));
		await expect(post({ ...body, channels: "2" })).rejects.toMatchObject(httpError(400));
		await expect(post({ ...body, peaks: [1.5] })).rejects.toMatchObject(httpError(400));
		await expect(
			post({ ...body, peaks: Array.from({ length: 4097 }, () => 0) }),
		).rejects.toMatchObject(httpError(400));
	});
	it("404 for an unknown stem", async () => {
		givenRow("stem", null);
		await expect(post()).rejects.toMatchObject(httpError(404));
	});
	it("400 when nothing was reserved or the URL is another file", async () => {
		data.reservedPathname.mockResolvedValue(null);
		await expect(post()).rejects.toMatchObject(httpError(400));
		data.reservedPathname.mockResolvedValue(pathname);
		blob.isOurBlobUrl.mockReturnValue(false);
		await expect(post()).rejects.toMatchObject(httpError(400));
		expect(blob.isOurBlobUrl).toHaveBeenCalledWith(url, pathname);
	});
	it("404 when the data layer finds no row to mark", async () => {
		data.markStemReady.mockResolvedValue(null);
		await expect(post()).rejects.toMatchObject(httpError(404));
		expect(jobs.schedulePlayback).not.toHaveBeenCalled();
	});
	it("marks the stem ready, schedules its rendition and tells the song's followers after the response", async () => {
		const res = await post();
		expect(await res.json()).toEqual({ ok: true });
		expect(data.reservedPathname).toHaveBeenCalledWith(ACCOUNT, "stem", STEM);
		expect(data.markStemReady).toHaveBeenCalledWith(ACCOUNT, STEM, {
			url,
			durationSeconds: 180.5,
			channels: 2,
			peaks: [0, 0.25, 1],
		});
		expect(jobs.schedulePlayback).toHaveBeenCalledWith([STEM]);
		expect(background).toHaveBeenCalledTimes(1);
		await (background.mock.calls[0][0] as () => Promise<void>)();
		expect(notifications.notifyStems).toHaveBeenCalledWith(ACCOUNT, SONG, USER);
	});
});
