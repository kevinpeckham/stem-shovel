import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	USER,
	asEditorOf,
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
import { PEAK_BINS } from "#lib/audio/peaks.js";

/** Step 3 of a mix upload (docs/mixes.md): an editor reports the blob URL and what the browser decoded; the MP3 and the notification follow. */
const { POST } = await import("./+server");

const SONG = fakeId("song-one");
const PROJECT = fakeId("proj-one");
const MIX = fakeId("mix-one");
const pathname = `accounts/${ACCOUNT}/songs/${SONG}/mixes/${MIX}.wav`;
const url = `https://store.public.blob.vercel-storage.com/${pathname}`;
const peaks = Array.from({ length: PEAK_BINS }, (_, i) => (i % 10) / 10);
const post = (body: unknown = { url }, locals = asEditorOf(ACCOUNT)) =>
	callRoute(POST, locals, jsonPost(`/api/mixes/${MIX}/ready`, body), { id: MIX });

beforeEach(() => {
	resetRemoteMocks();
	givenRow("songMix", { accountId: ACCOUNT, song: { projectId: PROJECT } });
	data.reservedPathname.mockResolvedValue(pathname);
	blob.isOurBlobUrl.mockReturnValue(true);
	data.markMixReady.mockResolvedValue({ id: MIX, songId: SONG, label: "Mix" });
});

describe("POST /api/mixes/[id]/ready", () => {
	it("401 signed out and 404 for a viewer", async () => {
		await expect(post({ url }, asSignedOut())).rejects.toMatchObject(httpError(401));
		await expect(post({ url }, asViewerOf(ACCOUNT))).rejects.toMatchObject(httpError(404));
	});
	it("400 without an https URL", async () => {
		await expect(post({ url: 42 })).rejects.toMatchObject(httpError(400));
	});
	it("404 for an unknown mix", async () => {
		givenRow("songMix", null);
		await expect(post()).rejects.toMatchObject(httpError(404));
	});
	it("400 for a URL that is not the reserved file", async () => {
		blob.isOurBlobUrl.mockReturnValue(false);
		await expect(post()).rejects.toMatchObject(httpError(400));
		expect(data.markMixReady).not.toHaveBeenCalled();
	});
	it("marks the mix ready with what was decoded, schedules the MP3 and notifies after the response", async () => {
		const res = await post({ url, durationSeconds: 212.5, peaks });
		expect(await res.json()).toEqual({ ok: true });
		expect(data.reservedPathname).toHaveBeenCalledWith(ACCOUNT, "mix", MIX);
		expect(data.markMixReady).toHaveBeenCalledWith(ACCOUNT, MIX, url, {
			durationSeconds: 212.5,
			peaks,
		});
		expect(jobs.scheduleMixPlayback).toHaveBeenCalledWith([MIX]);
		await (background.mock.calls[0][0] as () => Promise<void>)();
		expect(notifications.notifyMix).toHaveBeenCalledWith(ACCOUNT, MIX, USER);
	});
	it("a decode the browser could not do, or the wrong number of peaks, lands as nulls", async () => {
		await post({ url, durationSeconds: null, peaks: [0.5, 0.2] });
		expect(data.markMixReady).toHaveBeenCalledWith(ACCOUNT, MIX, url, {
			durationSeconds: null,
			peaks: null,
		});
	});
});
