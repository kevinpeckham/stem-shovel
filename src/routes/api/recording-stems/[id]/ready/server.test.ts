import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	asEditorOf,
	asSignedOut,
	fakeId,
	httpError,
} from "../../../../../../tests/helpers/fakeRequestEvent";
import { blob, data, resetRemoteMocks } from "../../../../../../tests/helpers/fakeServerModules";
import { callRoute, jsonPost } from "../../../../../../tests/helpers/fakeApiEvent";

/** Step 3 of saving a multitrack take's source: owned through the take; only the reserved file's URL counts. */
const { POST } = await import("./+server");

const RECORDING = fakeId("rec-one");
const STEM = fakeId("rstem-one");
const pathname = `accounts/${ACCOUNT}/recordings/${RECORDING}/${STEM}.webm`;
const url = `https://store.private.blob.vercel-storage.com/${pathname}`;
const post = (body: unknown = { url, durationSeconds: 8.25 }) =>
	callRoute(POST, asEditorOf(ACCOUNT), jsonPost(`/api/recording-stems/${STEM}/ready`, body), {
		id: STEM,
	});

beforeEach(() => {
	resetRemoteMocks();
	data.recordingStemById.mockResolvedValue({ accountId: ACCOUNT, recordingId: RECORDING });
	data.userOwnsRecording.mockResolvedValue(true);
	data.reservedPathname.mockResolvedValue(pathname);
	blob.isOurBlobUrl.mockReturnValue(true);
	data.markRecordingStemReady.mockResolvedValue({ id: STEM });
});

describe("POST /api/recording-stems/[id]/ready", () => {
	it("401 signed out", async () => {
		await expect(
			callRoute(POST, asSignedOut(), jsonPost("/", { url }), { id: STEM }),
		).rejects.toMatchObject(httpError(401));
	});
	it("400 without an https URL", async () => {
		await expect(post({ url: "http://example.com/x" })).rejects.toMatchObject(httpError(400));
		await expect(post({})).rejects.toMatchObject(httpError(400));
	});
	it("404 for an unknown source", async () => {
		data.recordingStemById.mockResolvedValue(null);
		await expect(post()).rejects.toMatchObject(httpError(404));
	});
	it("404 for someone else's take", async () => {
		data.userOwnsRecording.mockResolvedValue(false);
		await expect(post()).rejects.toMatchObject(httpError(404));
		expect(data.markRecordingStemReady).not.toHaveBeenCalled();
	});
	it("400 when nothing was reserved or the URL is not that file", async () => {
		data.reservedPathname.mockResolvedValue(null);
		await expect(post()).rejects.toMatchObject(httpError(400));
		data.reservedPathname.mockResolvedValue(pathname);
		blob.isOurBlobUrl.mockReturnValue(false);
		await expect(post()).rejects.toMatchObject(httpError(400));
		expect(blob.isOurBlobUrl).toHaveBeenCalledWith(url, pathname);
	});
	it("404 when the data layer finds no row to mark", async () => {
		data.markRecordingStemReady.mockResolvedValue(null);
		await expect(post()).rejects.toMatchObject(httpError(404));
	});
	it("marks the source ready with the URL and the length", async () => {
		const res = await post();
		expect(await res.json()).toEqual({ ok: true });
		expect(data.reservedPathname).toHaveBeenCalledWith(ACCOUNT, "recording-stem", STEM);
		expect(data.markRecordingStemReady).toHaveBeenCalledWith(ACCOUNT, STEM, url, 8.25);
	});
	it("a negative length is 0, a non-finite one is unknown", async () => {
		await post({ url, durationSeconds: -3 });
		expect(data.markRecordingStemReady).toHaveBeenLastCalledWith(ACCOUNT, STEM, url, 0);
		await post({ url, durationSeconds: "9" });
		expect(data.markRecordingStemReady).toHaveBeenLastCalledWith(ACCOUNT, STEM, url, null);
	});
});
