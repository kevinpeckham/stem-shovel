import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	asEditorOf,
	asSignedOut,
	fakeId,
	httpError,
} from "../../../../../../tests/helpers/fakeRequestEvent";
import {
	blob,
	data,
	givenRow,
	jobs,
	resetRemoteMocks,
} from "../../../../../../tests/helpers/fakeServerModules";
import { callRoute, jsonPost } from "../../../../../../tests/helpers/fakeApiEvent";

/** Step 3 of saving a take: owned through its idea; the MP3 rendition is scheduled once the row is marked. */
const { POST } = await import("./+server");

const RECORDING = fakeId("rec-one");
const pathname = `accounts/${ACCOUNT}/recordings/${RECORDING}.webm`;
const url = `https://store.private.blob.vercel-storage.com/${pathname}`;
const post = (body: unknown = { url, durationSeconds: 30 }) =>
	callRoute(POST, asEditorOf(ACCOUNT), jsonPost(`/api/recordings/${RECORDING}/ready`, body), {
		id: RECORDING,
	});

beforeEach(() => {
	resetRemoteMocks();
	givenRow("recording", { accountId: ACCOUNT });
	data.userOwnsRecording.mockResolvedValue(true);
	data.reservedPathname.mockResolvedValue(pathname);
	blob.isOurBlobUrl.mockReturnValue(true);
	data.markRecordingReady.mockResolvedValue({ id: RECORDING });
});

describe("POST /api/recordings/[id]/ready", () => {
	it("401 signed out", async () => {
		await expect(
			callRoute(POST, asSignedOut(), jsonPost("/", { url }), { id: RECORDING }),
		).rejects.toMatchObject(httpError(401));
	});
	it("400 without an https URL", async () => {
		await expect(post({ url: "ftp://x" })).rejects.toMatchObject(httpError(400));
	});
	it("404 for an unknown take or someone else's", async () => {
		givenRow("recording", null);
		await expect(post()).rejects.toMatchObject(httpError(404));
		givenRow("recording", { accountId: ACCOUNT });
		data.userOwnsRecording.mockResolvedValue(false);
		await expect(post()).rejects.toMatchObject(httpError(404));
		expect(data.markRecordingReady).not.toHaveBeenCalled();
	});
	it("400 for a URL that is not the reserved file", async () => {
		blob.isOurBlobUrl.mockReturnValue(false);
		await expect(post()).rejects.toMatchObject(httpError(400));
		expect(jobs.scheduleRecordingPlayback).not.toHaveBeenCalled();
	});
	it("404 when the data layer finds no row to mark", async () => {
		data.markRecordingReady.mockResolvedValue(null);
		await expect(post()).rejects.toMatchObject(httpError(404));
	});
	it("marks the take ready and schedules its playback rendition", async () => {
		const res = await post();
		expect(await res.json()).toEqual({ ok: true });
		expect(data.reservedPathname).toHaveBeenCalledWith(ACCOUNT, "recording", RECORDING);
		expect(data.markRecordingReady).toHaveBeenCalledWith(ACCOUNT, RECORDING, url, 30);
		expect(jobs.scheduleRecordingPlayback).toHaveBeenCalledWith([RECORDING]);
	});
});
