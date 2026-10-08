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
	type FakeRequestEvent,
} from "../../../../tests/helpers/fakeRequestEvent";
import {
	background,
	data,
	givenRow,
	notifications,
	resetRemoteMocks,
	type Mocks,
} from "../../../../tests/helpers/fakeServerModules";
import { callRoute, jsonPost } from "../../../../tests/helpers/fakeApiEvent";
import { MAX_NOTATION_PER_SONG, NOTATION_MAX_BYTES } from "#lib/constants/notationFormats.js";

/** Step 1 of a notation upload: an editor of the song's account reserves the row and learns where to upload. */
const { POST } = await import("./+server");

const SONG = fakeId("song-one");
const PROJECT = fakeId("proj-one");
const NOTATION = fakeId("notation-one");
const body = { songId: SONG, filename: "Lead Sheet.musicxml", sizeBytes: 120_000 };
const row = {
	id: NOTATION,
	pathname: `accounts/${ACCOUNT}/songs/${SONG}/notation/${NOTATION}.musicxml`,
};
const post = (b: unknown = body, locals: FakeRequestEvent = asEditorOf(ACCOUNT)) =>
	callRoute(POST, locals, jsonPost("/api/notation", b));
/** The relocate module is auto-mocked by fakeServerModules; `accessOfPathname` answers the store a reservation goes to. */
const relocate = (await import("#lib/server/relocate.js")) as unknown as Mocks;

beforeEach(() => {
	resetRemoteMocks();
	givenRow("song", { accountId: ACCOUNT, projectId: PROJECT });
	data.storageRoom.mockResolvedValue({ ok: true });
	data.createNotation.mockResolvedValue(row);
	relocate.accessOfPathname.mockResolvedValue("private");
});

describe("POST /api/notation", () => {
	it("401 signed out", async () => {
		await expect(post(body, asSignedOut())).rejects.toMatchObject(httpError(401));
	});
	it("400 without songId, filename or a numeric sizeBytes", async () => {
		await expect(post({ filename: "a.mxl", sizeBytes: 1 })).rejects.toMatchObject(httpError(400));
		await expect(post({ songId: SONG, sizeBytes: 1 })).rejects.toMatchObject(httpError(400));
		await expect(post({ songId: SONG, filename: "a.mxl", sizeBytes: "1" })).rejects.toMatchObject(
			httpError(400),
		);
		expect(data.createNotation).not.toHaveBeenCalled();
	});
	it("415 for an extension that is not MusicXML", async () => {
		await expect(post({ ...body, filename: "score.pdf" })).rejects.toMatchObject(httpError(415));
		await expect(post({ ...body, filename: "score" })).rejects.toMatchObject(httpError(415));
	});
	it("400 for an empty file", async () => {
		await expect(post({ ...body, sizeBytes: 0 })).rejects.toMatchObject(httpError(400));
		await expect(post({ ...body, sizeBytes: -1 })).rejects.toMatchObject(httpError(400));
	});
	it("413 over the per-file limit", async () => {
		await expect(post({ ...body, sizeBytes: NOTATION_MAX_BYTES + 1 })).rejects.toMatchObject(
			httpError(413),
		);
		expect((await post({ ...body, sizeBytes: NOTATION_MAX_BYTES })).status).toBe(200);
	});
	it("404 for a member of another account and for a viewer of the account", async () => {
		await expect(post(body, asOutsider())).rejects.toMatchObject(httpError(404));
		await expect(post(body, asViewerOf(ACCOUNT))).rejects.toMatchObject(httpError(404));
		expect(data.createNotation).not.toHaveBeenCalled();
	});
	it("404 for an unknown song", async () => {
		givenRow("song", null);
		await expect(post()).rejects.toMatchObject(httpError(404));
	});
	it("a restricted project admits a member only when added to it", async () => {
		data.projectRestricted.mockResolvedValue(true);
		await expect(post()).rejects.toMatchObject(httpError(404));
		expect(data.projectRestricted).toHaveBeenCalledWith(PROJECT);
		expect(data.projectRoleOf).toHaveBeenCalledWith(PROJECT, USER);
		data.projectRoleOf.mockResolvedValue("member");
		expect((await post()).status).toBe(200);
	});
	it("an admin passes without the project lookup", async () => {
		expect((await post(body, asAdminOf(ACCOUNT))).status).toBe(200);
		expect(data.projectRestricted).not.toHaveBeenCalled();
	});
	it("409 when the account's storage is full, before any row is made", async () => {
		data.storageRoom.mockResolvedValue({ ok: false, used: 20_000_000_000, limit: 20_000_000_000 });
		await expect(post()).rejects.toMatchObject({
			status: 409,
			body: { message: expect.stringContaining("storage is full") },
		});
		expect(data.storageRoom).toHaveBeenCalledWith(ACCOUNT, 120_000);
		expect(data.createNotation).not.toHaveBeenCalled();
		expect(background).not.toHaveBeenCalled();
	});
	it(`409 "full" at ${MAX_NOTATION_PER_SONG} notation files`, async () => {
		data.createNotation.mockResolvedValue("full");
		await expect(post()).rejects.toMatchObject({
			status: 409,
			body: { message: expect.stringContaining(String(MAX_NOTATION_PER_SONG)) },
		});
	});
	it("404 when the data layer finds no song in the account", async () => {
		data.createNotation.mockResolvedValue(null);
		await expect(post()).rejects.toMatchObject(httpError(404));
	});
	it("an editor reserves the row (format from the extension), learns where to upload, and the storage check runs after the response", async () => {
		const res = await post();
		expect(await res.json()).toEqual({
			notationId: NOTATION,
			pathname: row.pathname,
			access: "private",
		});
		expect(data.createNotation).toHaveBeenCalledWith(ACCOUNT, USER, SONG, {
			filename: "Lead Sheet.musicxml",
			sizeBytes: 120_000,
			format: "musicxml",
		});
		expect(relocate.accessOfPathname).toHaveBeenCalledWith(row.pathname);
		expect(background).toHaveBeenCalledTimes(1);
		await (background.mock.calls[0][0] as () => Promise<void>)();
		expect(notifications.checkStorage).toHaveBeenCalledWith(ACCOUNT);
	});
	it(".mxl is the compressed format and .xml plain MusicXML, whatever the case", async () => {
		await post({ ...body, filename: "Score.MXL" });
		expect(data.createNotation).toHaveBeenLastCalledWith(
			ACCOUNT,
			USER,
			SONG,
			expect.objectContaining({ format: "mxl" }),
		);
		await post({ ...body, filename: "score.xml" });
		expect(data.createNotation).toHaveBeenLastCalledWith(
			ACCOUNT,
			USER,
			SONG,
			expect.objectContaining({ format: "musicxml" }),
		);
	});
});
