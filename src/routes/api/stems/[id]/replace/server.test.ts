import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	asAdminOf,
	asEditorOf,
	asOutsider,
	asSignedOut,
	asViewerOf,
	fakeId,
	httpError,
} from "../../../../../../tests/helpers/fakeRequestEvent";
import {
	background,
	data,
	givenRow,
	notifications,
	resetRemoteMocks,
	type Mocks,
} from "../../../../../../tests/helpers/fakeServerModules";
import { callRoute, jsonPost } from "../../../../../../tests/helpers/fakeApiEvent";
import { STEM_MAX_BYTES } from "#lib/constants/stemFormats.js";

/** Like POST /api/stems for an existing stem: an editor reserves the next versioned pathname. */
const { POST } = await import("./+server");

const SONG = fakeId("song-one");
const PROJECT = fakeId("proj-one");
const STEM = fakeId("stem-one");
const body = { filename: "Bass take 2.flac", sizeBytes: 2_000_000 };
const row = { id: STEM, pathname: `accounts/${ACCOUNT}/songs/${SONG}/${STEM}-v2.flac` };
const post = (b: unknown = body, locals = asEditorOf(ACCOUNT)) =>
	callRoute(POST, locals, jsonPost(`/api/stems/${STEM}/replace`, b), { id: STEM });
/** The relocate module is auto-mocked by fakeServerModules; `accessOfPathname` answers the store a reservation goes to. */
const relocate = (await import("#lib/server/relocate.js")) as unknown as Mocks;

beforeEach(() => {
	resetRemoteMocks();
	givenRow("stem", { accountId: ACCOUNT, song: { projectId: PROJECT } });
	data.reserveStemReplacement.mockResolvedValue(row);
	data.storageRoom.mockResolvedValue({ ok: true });
	relocate.accessOfPathname.mockResolvedValue("public");
});

describe("POST /api/stems/[id]/replace", () => {
	it("400 for a body that is not JSON, and for a size that is not a whole number of bytes", async () => {
		await expect(post("{not json")).rejects.toMatchObject(httpError(400));
		await expect(post({ ...body, sizeBytes: 1.5 })).rejects.toMatchObject(httpError(400));
		await expect(post({ ...body, sizeBytes: 0 })).rejects.toMatchObject(httpError(400));
		await expect(post({ ...body, sizeBytes: -3 })).rejects.toMatchObject(httpError(400));
	});
	it("401 signed out, 404 for an outsider and for a viewer", async () => {
		await expect(post(body, asSignedOut())).rejects.toMatchObject(httpError(401));
		await expect(post(body, asOutsider())).rejects.toMatchObject(httpError(404));
		await expect(post(body, asViewerOf(ACCOUNT))).rejects.toMatchObject(httpError(404));
		expect(data.reserveStemReplacement).not.toHaveBeenCalled();
	});
	it("400 without a filename or a numeric sizeBytes", async () => {
		await expect(post({ sizeBytes: 1 })).rejects.toMatchObject(httpError(400));
		await expect(post({ ...body, sizeBytes: null })).rejects.toMatchObject(httpError(400));
	});
	it("415 for an extension that is not a stem format", async () => {
		await expect(post({ ...body, filename: "bass.ogg" })).rejects.toMatchObject(httpError(415));
	});
	it("413 over the per-stem limit", async () => {
		await expect(post({ ...body, sizeBytes: STEM_MAX_BYTES + 1 })).rejects.toMatchObject(
			httpError(413),
		);
		expect(data.reserveStemReplacement).not.toHaveBeenCalled();
	});
	it("404 for an unknown stem", async () => {
		givenRow("stem", null);
		await expect(post()).rejects.toMatchObject(httpError(404));
	});
	it("404 when the data layer finds no stem to replace", async () => {
		data.reserveStemReplacement.mockResolvedValue(null);
		await expect(post()).rejects.toMatchObject(httpError(404));
	});
	it("an editor reserves the replacement (type from the extension) and learns where to upload", async () => {
		const res = await post();
		expect(await res.json()).toEqual({ stemId: STEM, pathname: row.pathname, access: "public" });
		expect(data.reserveStemReplacement).toHaveBeenCalledWith(ACCOUNT, STEM, {
			filename: "Bass take 2.flac",
			contentType: "audio/flac",
			sizeBytes: 2_000_000,
		});
		expect(relocate.accessOfPathname).toHaveBeenCalledWith(row.pathname);
		// Like POST /api/stems, the new file is counted against the account's storage first, and the warning check follows.
		expect(data.storageRoom).toHaveBeenCalledWith(ACCOUNT, 2_000_000);
		expect(background).toHaveBeenCalledTimes(1);
		await (background.mock.calls[0][0] as () => Promise<void>)();
		expect(notifications.checkStorage).toHaveBeenCalledWith(ACCOUNT);
	});
	it("409 when the account's storage is full, before anything is reserved", async () => {
		data.storageRoom.mockResolvedValue({ ok: false, used: 20_000_000_000, limit: 20_000_000_000 });
		await expect(post()).rejects.toMatchObject(httpError(409));
		expect(data.reserveStemReplacement).not.toHaveBeenCalled();
	});
	it("an admin passes without the project lookup", async () => {
		const res = await post(body, asAdminOf(ACCOUNT));
		expect(res.status).toBe(200);
	});
});
