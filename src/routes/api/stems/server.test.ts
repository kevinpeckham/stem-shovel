import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	USER,
	asAdminOf,
	asEditorOf,
	asOutsider,
	asSignedOut,
	asViewerOf,
	fakeId,
	httpError,
} from "../../../../tests/helpers/fakeRequestEvent";
import {
	data,
	givenRow,
	resetRemoteMocks,
	type Mocks,
} from "../../../../tests/helpers/fakeServerModules";
import { callRoute, jsonPost } from "../../../../tests/helpers/fakeApiEvent";
import { MAX_STEMS_PER_SONG, STEM_MAX_BYTES } from "$lib/constants/stemFormats";

/** Step 1 of a stem upload: an editor of the song's account reserves the row. */
const { POST } = await import("./+server");

const SONG = fakeId("song-one");
const PROJECT = fakeId("proj-one");
const STEM = fakeId("stem-one");
const body = { songId: SONG, filename: "Bass.WAV", sizeBytes: 1_000_000 };
const row = { id: STEM, pathname: `accounts/${ACCOUNT}/songs/${SONG}/${STEM}.wav` };
const post = (b: unknown = body) => callRoute(POST, asEditorOf(ACCOUNT), jsonPost("/api/stems", b));
/** The relocate module is auto-mocked by fakeServerModules; `accessOfPathname` answers the store a reservation goes to. */
const relocate = (await import("$lib/server/relocate")) as unknown as Mocks;

beforeEach(() => {
	resetRemoteMocks();
	givenRow("song", { accountId: ACCOUNT, projectId: PROJECT });
	data.storageRoom.mockResolvedValue({ ok: true });
	data.createStem.mockResolvedValue(row);
	relocate.accessOfPathname.mockResolvedValue("public");
});

describe("POST /api/stems", () => {
	it("404 (not 401) signed out: membership is what is checked", async () => {
		await expect(callRoute(POST, asSignedOut(), jsonPost("/", body))).rejects.toMatchObject(
			httpError(404),
		);
	});
	it("400 without songId, filename or a numeric sizeBytes", async () => {
		await expect(post({ filename: "a.wav", sizeBytes: 1 })).rejects.toMatchObject(httpError(400));
	});
	it("415 for an extension that is not a stem format", async () => {
		await expect(post({ ...body, filename: "bass.ogg" })).rejects.toMatchObject(httpError(415));
	});
	it("413 over the per-stem limit", async () => {
		await expect(post({ ...body, sizeBytes: STEM_MAX_BYTES + 1 })).rejects.toMatchObject(
			httpError(413),
		);
	});
	it("404 for a member of another account", async () => {
		await expect(callRoute(POST, asOutsider(), jsonPost("/", body))).rejects.toMatchObject(
			httpError(404),
		);
		expect(data.createStem).not.toHaveBeenCalled();
	});
	it("404 for a viewer of the account", async () => {
		await expect(callRoute(POST, asViewerOf(ACCOUNT), jsonPost("/", body))).rejects.toMatchObject(
			httpError(404),
		);
	});
	it("404 for an unknown song", async () => {
		givenRow("song", null);
		await expect(post()).rejects.toMatchObject(httpError(404));
	});
	it("409 when the account's storage is full", async () => {
		data.storageRoom.mockResolvedValue({ ok: false, used: 1, limit: 1 });
		await expect(post()).rejects.toMatchObject(httpError(409));
		expect(data.storageRoom).toHaveBeenCalledWith(ACCOUNT, 1_000_000);
	});
	it(`409 "full" at ${MAX_STEMS_PER_SONG} stems`, async () => {
		data.createStem.mockResolvedValue("full");
		await expect(post()).rejects.toMatchObject({
			status: 409,
			body: { message: expect.stringContaining(String(MAX_STEMS_PER_SONG)) },
		});
	});
	it("404 when the data layer finds no song", async () => {
		data.createStem.mockResolvedValue(null);
		await expect(post()).rejects.toMatchObject(httpError(404));
	});
	it("an editor reserves the stem (type from the extension) and learns where to upload", async () => {
		const res = await post();
		expect(await res.json()).toEqual({ stemId: STEM, pathname: row.pathname, access: "public" });
		expect(data.createStem).toHaveBeenCalledWith(ACCOUNT, USER, SONG, {
			filename: "Bass.WAV",
			contentType: "audio/wav",
			sizeBytes: 1_000_000,
		});
	});
	it("an admin passes without the project lookup", async () => {
		const res = await callRoute(POST, asAdminOf(ACCOUNT), jsonPost("/", body));
		expect(res.status).toBe(200);
	});
});
