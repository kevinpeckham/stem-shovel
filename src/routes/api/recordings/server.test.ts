import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	USER,
	asEditorOf,
	asSignedOut,
	fakeId,
	httpError,
} from "../../../../tests/helpers/fakeRequestEvent";
import { data, givenRow, resetRemoteMocks } from "../../../../tests/helpers/fakeServerModules";
import { callRoute, jsonPost } from "../../../../tests/helpers/fakeApiEvent";
import { MAX_TAKE_BYTES } from "$lib/constants/takeLimits";

/** Step 1 of saving a take: the idea must be the caller's own, the account must have room. */
const { POST } = await import("./+server");

const IDEA = fakeId("idea-one");
const RECORDING = fakeId("rec-one");
const body = {
	ideaId: IDEA,
	title: "  Verse idea  ",
	filename: "take.webm",
	sizeBytes: 2048,
	codec: "opus",
};
const row = {
	id: RECORDING,
	takeNumber: 3,
	pathname: `accounts/${ACCOUNT}/recordings/${RECORDING}.webm`,
};
const post = (b: unknown = body) =>
	callRoute(POST, asEditorOf(ACCOUNT), jsonPost("/api/recordings", b));

beforeEach(() => {
	resetRemoteMocks();
	givenRow("idea", { accountId: ACCOUNT });
	data.userOwnsIdea.mockResolvedValue(true);
	data.storageRoom.mockResolvedValue({ ok: true });
	data.createRecording.mockResolvedValue(row);
	data.recordingStore.mockReturnValue("private");
});

describe("POST /api/recordings", () => {
	it("401 signed out", async () => {
		await expect(callRoute(POST, asSignedOut(), jsonPost("/", body))).rejects.toMatchObject(
			httpError(401),
		);
	});
	it("400 without ideaId, filename or a numeric sizeBytes", async () => {
		await expect(post({ ...body, ideaId: undefined })).rejects.toMatchObject(httpError(400));
		await expect(post({ ...body, sizeBytes: "2048" })).rejects.toMatchObject(httpError(400));
	});
	it("415 for a format that is not audio", async () => {
		await expect(post({ ...body, filename: "take.txt" })).rejects.toMatchObject(httpError(415));
	});
	it("413 over the take byte limit", async () => {
		await expect(post({ ...body, sizeBytes: MAX_TAKE_BYTES + 1 })).rejects.toMatchObject(
			httpError(413),
		);
	});
	it("404 for an idea the caller did not make", async () => {
		data.userOwnsIdea.mockResolvedValue(false);
		await expect(post()).rejects.toMatchObject(httpError(404));
		expect(data.createRecording).not.toHaveBeenCalled();
	});
	it("404 for an unknown idea", async () => {
		givenRow("idea", null);
		await expect(post()).rejects.toMatchObject(httpError(404));
	});
	it("409 when the account's storage is full", async () => {
		data.storageRoom.mockResolvedValue({ ok: false, used: 1, limit: 1 });
		await expect(post()).rejects.toMatchObject(httpError(409));
		expect(data.storageRoom).toHaveBeenCalledWith(ACCOUNT, 2048);
	});
	it("404 when the data layer finds no idea", async () => {
		data.createRecording.mockResolvedValue(null);
		await expect(post()).rejects.toMatchObject(httpError(404));
	});
	it("reserves the take (title trimmed, codec kept, unknown codec dropped) and answers where to upload", async () => {
		const res = await post();
		expect(await res.json()).toEqual({
			recordingId: RECORDING,
			takeNumber: 3,
			pathname: row.pathname,
			access: "private",
		});
		expect(data.createRecording).toHaveBeenCalledWith(ACCOUNT, USER, IDEA, {
			title: "Verse idea",
			filename: "take.webm",
			contentType: "audio/webm",
			sizeBytes: 2048,
			codec: "opus",
			trimSilence: false,
		});
		await post({ ...body, codec: "mp3", trimSilence: true });
		expect(data.createRecording).toHaveBeenLastCalledWith(
			ACCOUNT,
			USER,
			IDEA,
			expect.objectContaining({ codec: null, trimSilence: true }),
		);
	});
});
