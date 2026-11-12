import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	USER,
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
import { DEMO_NOTES_MAX, MAX_DEMOS_PER_SONG } from "#lib/constants/demoFormats.js";
import { STEM_MAX_BYTES } from "#lib/constants/stemFormats.js";

/** Step 1 of a demo upload: an editor of the song's account reserves the row; the formats are the broad demo list. */
const { POST } = await import("./+server");

const SONG = fakeId("song-one");
const PROJECT = fakeId("proj-one");
const DEMO = fakeId("demo-one");
const body = { songId: SONG, filename: "memo.ogg", sizeBytes: 5_000 };
const row = { id: DEMO, pathname: `accounts/${ACCOUNT}/songs/${SONG}/demos/${DEMO}.ogg` };
const post = (b: unknown = body, locals = asEditorOf(ACCOUNT)) =>
	callRoute(POST, locals, jsonPost("/api/demos", b));
const relocate = (await import("#lib/server/relocate.js")) as unknown as Mocks;

beforeEach(() => {
	resetRemoteMocks();
	givenRow("song", { accountId: ACCOUNT, projectId: PROJECT });
	data.storageRoom.mockResolvedValue({ ok: true });
	data.createDemo.mockResolvedValue(row);
	relocate.accessOfPathname.mockResolvedValue("private");
});

describe("POST /api/demos", () => {
	it("401 signed out, for an outsider and for a viewer", async () => {
		await expect(post(body, asSignedOut())).rejects.toMatchObject(httpError(401));
		await expect(post(body, asOutsider())).rejects.toMatchObject(httpError(404));
		await expect(post(body, asViewerOf(ACCOUNT))).rejects.toMatchObject(httpError(404));
		expect(data.createDemo).not.toHaveBeenCalled();
	});
	it("400 without songId, filename or a numeric sizeBytes", async () => {
		await expect(post({ ...body, sizeBytes: undefined })).rejects.toMatchObject(httpError(400));
	});
	it("415 for a file that is not audio (a stem-only list would refuse .ogg; demos take it)", async () => {
		await expect(post({ ...body, filename: "memo.txt" })).rejects.toMatchObject(httpError(415));
	});
	it("413 over the per-file limit", async () => {
		await expect(post({ ...body, sizeBytes: STEM_MAX_BYTES + 1 })).rejects.toMatchObject(
			httpError(413),
		);
	});
	it("409 when the account's storage is full", async () => {
		data.storageRoom.mockResolvedValue({ ok: false, used: 1, limit: 1 });
		await expect(post()).rejects.toMatchObject(httpError(409));
	});
	it(`409 "full" at ${MAX_DEMOS_PER_SONG} demos`, async () => {
		data.createDemo.mockResolvedValue("full");
		await expect(post()).rejects.toMatchObject({
			status: 409,
			body: { message: expect.stringContaining(String(MAX_DEMOS_PER_SONG)) },
		});
	});
	it("404 when the data layer finds no song", async () => {
		data.createDemo.mockResolvedValue(null);
		await expect(post()).rejects.toMatchObject(httpError(404));
	});
	it("an editor reserves the demo and learns where to upload", async () => {
		const res = await post();
		expect(await res.json()).toEqual({ demoId: DEMO, pathname: row.pathname, access: "private" });
		expect(data.createDemo).toHaveBeenCalledWith(ACCOUNT, USER, SONG, {
			filename: "memo.ogg",
			contentType: "audio/ogg",
			sizeBytes: 5_000,
			notes: "",
		});
	});
	it("passes the notes typed at upload through to the row", async () => {
		await post({ ...body, notes: "The slow verse\nlisten for the harmony" });
		expect(data.createDemo).toHaveBeenCalledWith(ACCOUNT, USER, SONG, {
			filename: "memo.ogg",
			contentType: "audio/ogg",
			sizeBytes: 5_000,
			notes: "The slow verse\nlisten for the harmony",
		});
	});
	it(`400 for notes over ${DEMO_NOTES_MAX} characters, or notes that are not text`, async () => {
		await expect(post({ ...body, notes: "x".repeat(DEMO_NOTES_MAX + 1) })).rejects.toMatchObject({
			status: 400,
			body: { message: expect.stringContaining(String(DEMO_NOTES_MAX)) },
		});
		await expect(post({ ...body, notes: 42 })).rejects.toMatchObject(httpError(400));
		expect(data.createDemo).not.toHaveBeenCalled();
	});
});
