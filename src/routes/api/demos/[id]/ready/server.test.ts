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

/** Step 3 of a demo upload: an editor reports the blob URL; the MP3 and the notification follow. */
const { POST } = await import("./+server");

const SONG = fakeId("song-one");
const PROJECT = fakeId("proj-one");
const DEMO = fakeId("demo-one");
const pathname = `accounts/${ACCOUNT}/songs/${SONG}/demos/${DEMO}.m4a`;
const url = `https://store.public.blob.vercel-storage.com/${pathname}`;
const post = (body: unknown = { url }, locals = asEditorOf(ACCOUNT)) =>
	callRoute(POST, locals, jsonPost(`/api/demos/${DEMO}/ready`, body), { id: DEMO });

beforeEach(() => {
	resetRemoteMocks();
	givenRow("demo", { accountId: ACCOUNT, song: { projectId: PROJECT } });
	data.reservedPathname.mockResolvedValue(pathname);
	blob.isOurBlobUrl.mockReturnValue(true);
	data.markDemoReady.mockResolvedValue({ id: DEMO });
});

describe("POST /api/demos/[id]/ready", () => {
	it("401 signed out and for a viewer", async () => {
		await expect(post({ url }, asSignedOut())).rejects.toMatchObject(httpError(401));
		await expect(post({ url }, asViewerOf(ACCOUNT))).rejects.toMatchObject(httpError(404));
	});
	it("400 without an https URL", async () => {
		await expect(post({ url: 42 })).rejects.toMatchObject(httpError(400));
	});
	it("404 for an unknown demo", async () => {
		givenRow("demo", null);
		await expect(post()).rejects.toMatchObject(httpError(404));
	});
	it("400 for a URL that is not the reserved file", async () => {
		blob.isOurBlobUrl.mockReturnValue(false);
		await expect(post()).rejects.toMatchObject(httpError(400));
		expect(data.markDemoReady).not.toHaveBeenCalled();
	});
	it("404 when the data layer finds no row to mark", async () => {
		data.markDemoReady.mockResolvedValue(null);
		await expect(post()).rejects.toMatchObject(httpError(404));
	});
	it("marks the demo ready, schedules the MP3 and notifies after the response", async () => {
		const res = await post();
		expect(await res.json()).toEqual({ ok: true });
		expect(data.reservedPathname).toHaveBeenCalledWith(ACCOUNT, "demo", DEMO);
		expect(data.markDemoReady).toHaveBeenCalledWith(ACCOUNT, DEMO, url);
		expect(jobs.scheduleDemoPlayback).toHaveBeenCalledWith([DEMO]);
		await (background.mock.calls[0][0] as () => Promise<void>)();
		expect(notifications.notifyDemo).toHaveBeenCalledWith(ACCOUNT, DEMO, USER);
	});
});
