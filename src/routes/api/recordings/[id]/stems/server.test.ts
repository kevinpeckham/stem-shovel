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
	data,
	givenRow,
	resetRemoteMocks,
} from "../../../../../../tests/helpers/fakeServerModules";
import { callRoute, jsonPost } from "../../../../../../tests/helpers/fakeApiEvent";
import { MAX_TAKE_BYTES } from "$lib/constants/takeLimits";

/** Step 1 of saving one source of a multitrack take: owned through the take, counted against its account. */
const { POST } = await import("./+server");

const RECORDING = fakeId("rec-one");
const STEM = fakeId("rstem-one");
const body = {
	label: " Vocals ",
	sortOrder: 2,
	filename: "vocals.webm",
	sizeBytes: 4096,
	codec: "opus",
};
const row = { id: STEM, pathname: `accounts/${ACCOUNT}/recordings/${RECORDING}/${STEM}.webm` };
const post = (b: unknown = body) =>
	callRoute(POST, asEditorOf(ACCOUNT), jsonPost(`/api/recordings/${RECORDING}/stems`, b), {
		id: RECORDING,
	});

beforeEach(() => {
	resetRemoteMocks();
	givenRow("recording", { accountId: ACCOUNT });
	data.userOwnsRecording.mockResolvedValue(true);
	data.storageRoom.mockResolvedValue({ ok: true });
	data.createRecordingStem.mockResolvedValue(row);
	data.recordingStore.mockReturnValue("private");
});

describe("POST /api/recordings/[id]/stems", () => {
	it("401 signed out", async () => {
		await expect(
			callRoute(POST, asSignedOut(), jsonPost("/", body), { id: RECORDING }),
		).rejects.toMatchObject(httpError(401));
	});
	it("400 without label, filename or a numeric sizeBytes", async () => {
		await expect(post({ ...body, label: "" })).rejects.toMatchObject(httpError(400));
		await expect(post({ ...body, sizeBytes: null })).rejects.toMatchObject(httpError(400));
	});
	it("415 for a format that is not audio", async () => {
		await expect(post({ ...body, filename: "vocals.pdf" })).rejects.toMatchObject(httpError(415));
	});
	it("413 over the take byte limit", async () => {
		await expect(post({ ...body, sizeBytes: MAX_TAKE_BYTES + 1 })).rejects.toMatchObject(
			httpError(413),
		);
	});
	it("404 for someone else's take", async () => {
		data.userOwnsRecording.mockResolvedValue(false);
		await expect(post()).rejects.toMatchObject(httpError(404));
		expect(data.createRecordingStem).not.toHaveBeenCalled();
	});
	it("404 for an unknown take", async () => {
		givenRow("recording", null);
		await expect(post()).rejects.toMatchObject(httpError(404));
	});
	it("409 when the account's storage is full", async () => {
		data.storageRoom.mockResolvedValue({ ok: false, used: 1, limit: 1 });
		await expect(post()).rejects.toMatchObject(httpError(409));
	});
	it("404 when the data layer finds no take", async () => {
		data.createRecordingStem.mockResolvedValue(null);
		await expect(post()).rejects.toMatchObject(httpError(404));
	});
	it("reserves the source under the take and answers where to upload", async () => {
		const res = await post();
		expect(await res.json()).toEqual({ stemId: STEM, pathname: row.pathname, access: "private" });
		expect(data.createRecordingStem).toHaveBeenCalledWith(ACCOUNT, RECORDING, {
			label: "Vocals",
			sortOrder: 2,
			filename: "vocals.webm",
			contentType: "audio/webm",
			sizeBytes: 4096,
			codec: "opus",
		});
	});
});
