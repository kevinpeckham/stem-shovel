import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	USER,
	asEditorOf,
	asSignedOut,
	fakeId,
	httpError,
} from "../../../../../tests/helpers/fakeRequestEvent";
import { data, givenRow, resetRemoteMocks } from "../../../../../tests/helpers/fakeServerModules";
import { callRoute, jsonPost } from "../../../../../tests/helpers/fakeApiEvent";
import { MAX_STUDIO_SOURCES } from "$lib/constants/studio";
import { MAX_TAKE_BYTES } from "$lib/constants/takeLimits";

/** Step 1 of saving a Studio source: the song must be the caller's own idea, the account must have room. */
const { POST } = await import("./+server");

const IDEA = fakeId("idea-one");
const SOURCE = fakeId("src-one");
const reserve = {
	id: SOURCE,
	ideaId: IDEA,
	kind: "take",
	trackLabel: "Guitar",
	takeNumber: 1,
	filename: "take.wav",
	sizeBytes: 1024,
	codec: "pcm",
	sampleRate: 48_000,
	channels: 2,
	durationSeconds: 12.5,
};
const made = {
	sourceId: SOURCE,
	pathname: `accounts/${ACCOUNT}/studio/${IDEA}/${SOURCE}.wav`,
	access: "private",
};
const post = (body: unknown = reserve) =>
	callRoute(POST, asEditorOf(ACCOUNT), jsonPost("/api/studio/sources", body));

beforeEach(() => {
	resetRemoteMocks();
	givenRow("idea", { accountId: ACCOUNT });
	data.userOwnsIdea.mockResolvedValue(true);
	data.storageRoom.mockResolvedValue({ ok: true });
	data.createStudioSource.mockResolvedValue(made);
});

describe("POST /api/studio/sources", () => {
	it("401 signed out", async () => {
		await expect(callRoute(POST, asSignedOut(), jsonPost("/", reserve))).rejects.toMatchObject(
			httpError(401),
		);
	});
	it("400 on a body that fails the schema", async () => {
		await expect(post({ ...reserve, kind: "upload" })).rejects.toMatchObject(httpError(400));
	});
	it("400 on malformed JSON", async () => {
		await expect(post("{not json")).rejects.toMatchObject(httpError(400));
	});
	it("413 over the take byte limit, as the other reserve routes answer", async () => {
		await expect(post({ ...reserve, sizeBytes: MAX_TAKE_BYTES + 1 })).rejects.toMatchObject(
			httpError(413),
		);
	});
	it("404 for an idea the caller did not make", async () => {
		data.userOwnsIdea.mockResolvedValue(false);
		await expect(post()).rejects.toMatchObject(httpError(404));
		expect(data.createStudioSource).not.toHaveBeenCalled();
	});
	it("404 for an unknown idea", async () => {
		givenRow("idea", null);
		await expect(post()).rejects.toMatchObject(httpError(404));
	});
	it("409 when the account's storage is full", async () => {
		data.storageRoom.mockResolvedValue({ ok: false, used: 20e9, limit: 20e9 });
		await expect(post()).rejects.toMatchObject(httpError(409));
		expect(data.storageRoom).toHaveBeenCalledWith(ACCOUNT, 1024);
		expect(data.createStudioSource).not.toHaveBeenCalled();
	});
	it(`409 "full" at ${MAX_STUDIO_SOURCES} sources`, async () => {
		data.createStudioSource.mockResolvedValue("full");
		await expect(post()).rejects.toMatchObject({
			status: 409,
			body: { message: expect.stringContaining(String(MAX_STUDIO_SOURCES)) },
		});
	});
	it('409 "exists" when the browser\'s id is taken', async () => {
		data.createStudioSource.mockResolvedValue("exists");
		await expect(post()).rejects.toMatchObject(httpError(409));
	});
	it("415 for an audio format the Studio cannot take", async () => {
		data.createStudioSource.mockResolvedValue("unsupported");
		await expect(post({ ...reserve, filename: "take.txt" })).rejects.toMatchObject(httpError(415));
	});
	it("404 when the data layer finds no song", async () => {
		data.createStudioSource.mockResolvedValue(null);
		await expect(post()).rejects.toMatchObject(httpError(404));
	});
	it("reserves the row for the maker with the browser's id and returns where to upload", async () => {
		const res = await post();
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual(made);
		expect(data.createStudioSource).toHaveBeenCalledWith(
			ACCOUNT,
			USER,
			expect.objectContaining({ id: SOURCE, ideaId: IDEA, filename: "take.wav" }),
		);
	});
});
