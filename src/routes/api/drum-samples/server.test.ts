import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	USER,
	asAdminOf,
	asEditorOf,
	asOutsider,
	asSignedOut,
	asSystemAdmin,
	asViewerOf,
	fakeId,
	fakeMembership,
	httpError,
} from "../../../../tests/helpers/fakeRequestEvent";
import {
	background,
	blob,
	data,
	notifications,
	resetRemoteMocks,
} from "../../../../tests/helpers/fakeServerModules";
import { callRoute, jsonPost } from "../../../../tests/helpers/fakeApiEvent";
import { DRUM_SAMPLE_MAX_BYTES, OVERRIDABLE_KITS } from "#lib/constants/drumKits.js";

/**
 * Step 1 of a drum sample upload: an editor reserves a voice of an account
 * kit (counted against the account's storage); a site kit's wants a system
 * admin, and a built-in kit's row is made on its first replacement.
 */
const { POST } = await import("./+server");

const KIT = fakeId("kit-one");
const SAMPLE = fakeId("sample-one");
const BUILTIN = OVERRIDABLE_KITS[0];
const body = { kitId: KIT, voice: "snare", filename: "Snare.WAV", sizeBytes: 50_000 };
const row = { id: SAMPLE, pathname: `accounts/${ACCOUNT}/kits/${KIT}/${SAMPLE}.wav` };
const siteRow = { id: SAMPLE, pathname: `site/kits/${BUILTIN}/${SAMPLE}.wav` };
const post = (b: unknown = body, locals = asEditorOf(ACCOUNT)) =>
	callRoute(POST, locals, jsonPost("/api/drum-samples", b));

beforeEach(() => {
	resetRemoteMocks();
	data.accountOfDrumKit.mockResolvedValue({ accountId: ACCOUNT });
	data.storageRoom.mockResolvedValue({ ok: true });
	data.createDrumSample.mockResolvedValue(row);
	data.ensureBuiltinKitRow.mockResolvedValue({ id: BUILTIN });
	blob.recordingAccess.mockReturnValue("private");
});

describe("POST /api/drum-samples", () => {
	it("401 signed out, 404 for an outsider and for a viewer of an account kit", async () => {
		await expect(post(body, asSignedOut())).rejects.toMatchObject(httpError(401));
		await expect(post(body, asOutsider())).rejects.toMatchObject(httpError(404));
		await expect(post(body, asViewerOf(ACCOUNT))).rejects.toMatchObject(httpError(404));
		expect(data.createDrumSample).not.toHaveBeenCalled();
	});
	it("400 without kitId, voice, filename or a numeric sizeBytes", async () => {
		await expect(post({ ...body, kitId: undefined })).rejects.toMatchObject(httpError(400));
		await expect(post({ ...body, voice: "" })).rejects.toMatchObject(httpError(400));
		await expect(post({ ...body, filename: undefined })).rejects.toMatchObject(httpError(400));
		await expect(post({ ...body, sizeBytes: "50000" })).rejects.toMatchObject(httpError(400));
	});
	it("400 for a voice the drum machine does not have", async () => {
		await expect(post({ ...body, voice: "triangle" })).rejects.toMatchObject(httpError(400));
	});
	it("415 for a file that is not audio (the broad demo list)", async () => {
		await expect(post({ ...body, filename: "snare.pdf" })).rejects.toMatchObject(httpError(415));
	});
	it("413 over the per-sample cap", async () => {
		await expect(post({ ...body, sizeBytes: DRUM_SAMPLE_MAX_BYTES + 1 })).rejects.toMatchObject(
			httpError(413),
		);
		expect(data.accountOfDrumKit).not.toHaveBeenCalled();
	});
	it("404 for an unknown kit", async () => {
		data.accountOfDrumKit.mockResolvedValue(null);
		await expect(post()).rejects.toMatchObject(httpError(404));
		expect(data.createDrumSample).not.toHaveBeenCalled();
	});
	it("409 when the account's storage is full", async () => {
		data.storageRoom.mockResolvedValue({ ok: false, used: 1, limit: 1 });
		await expect(post()).rejects.toMatchObject(httpError(409));
		expect(data.storageRoom).toHaveBeenCalledWith(ACCOUNT, 50_000);
		expect(data.createDrumSample).not.toHaveBeenCalled();
	});
	it("404 when the data layer finds no kit in that scope", async () => {
		data.createDrumSample.mockResolvedValue(null);
		await expect(post()).rejects.toMatchObject(httpError(404));
	});
	it("an editor reserves a voice of an account kit in the recordings store and the storage check runs after", async () => {
		const res = await post();
		expect(await res.json()).toEqual({
			sampleId: SAMPLE,
			pathname: row.pathname,
			access: "private",
		});
		expect(data.createDrumSample).toHaveBeenCalledWith(ACCOUNT, USER, KIT, "snare", {
			filename: "Snare.WAV",
			contentType: "audio/wav",
			sizeBytes: 50_000,
		});
		expect(data.ensureBuiltinKitRow).not.toHaveBeenCalled();
		expect(background).toHaveBeenCalledTimes(1);
		await (background.mock.calls[0][0] as () => Promise<void>)();
		expect(notifications.checkStorage).toHaveBeenCalledWith(ACCOUNT);
	});
	it("an account admin passes too", async () => {
		const res = await post(body, asAdminOf(ACCOUNT));
		expect(res.status).toBe(200);
	});
	describe("a site kit (no account)", () => {
		beforeEach(() => {
			data.accountOfDrumKit.mockResolvedValue({ accountId: null });
			data.createDrumSample.mockResolvedValue(siteRow);
		});
		it("404 for a plain member and for an outsider; 401 signed out", async () => {
			await expect(post(body, asEditorOf(ACCOUNT))).rejects.toMatchObject(httpError(404));
			await expect(post(body, asOutsider())).rejects.toMatchObject(httpError(404));
			await expect(post(body, asSignedOut())).rejects.toMatchObject(httpError(401));
			expect(data.createDrumSample).not.toHaveBeenCalled();
		});
		it("a system admin reserves it in the public store, with no storage check", async () => {
			const admin = asSystemAdmin();
			const res = await post(body, admin);
			expect(await res.json()).toEqual({
				sampleId: SAMPLE,
				pathname: siteRow.pathname,
				access: "public",
			});
			expect(data.createDrumSample).toHaveBeenCalledWith(
				null,
				admin.locals.user!.id,
				KIT,
				"snare",
				{
					filename: "Snare.WAV",
					contentType: "audio/wav",
					sizeBytes: 50_000,
				},
			);
			expect(data.storageRoom).not.toHaveBeenCalled();
			expect(background).not.toHaveBeenCalled();
		});
	});
	describe(`a built-in kit ("${BUILTIN}")`, () => {
		const builtin = { ...body, kitId: BUILTIN };
		beforeEach(() => {
			data.accountOfDrumKit.mockResolvedValue({ accountId: null });
			data.createDrumSample.mockResolvedValue(siteRow);
		});
		it("404 for everyone but a system admin, before the kit row is touched (signed out too)", async () => {
			await expect(post(builtin, asSignedOut())).rejects.toMatchObject(httpError(404));
			await expect(post(builtin, asEditorOf(ACCOUNT))).rejects.toMatchObject(httpError(404));
			await expect(post(builtin, asAdminOf(ACCOUNT))).rejects.toMatchObject(httpError(404));
			expect(data.ensureBuiltinKitRow).not.toHaveBeenCalled();
			expect(data.accountOfDrumKit).not.toHaveBeenCalled();
		});
		it("a system admin (even one with memberships) makes the kit's row first, then reserves the drum", async () => {
			const admin = asSystemAdmin([fakeMembership(ACCOUNT, "member")]);
			const res = await post(builtin, admin);
			expect(await res.json()).toEqual({
				sampleId: SAMPLE,
				pathname: siteRow.pathname,
				access: "public",
			});
			expect(data.ensureBuiltinKitRow).toHaveBeenCalledWith(BUILTIN);
			expect(data.accountOfDrumKit).toHaveBeenCalledWith(BUILTIN);
			expect(data.createDrumSample).toHaveBeenCalledWith(
				null,
				admin.locals.user!.id,
				BUILTIN,
				"snare",
				{ filename: "Snare.WAV", contentType: "audio/wav", sizeBytes: 50_000 },
			);
			expect(data.storageRoom).not.toHaveBeenCalled();
		});
	});
});
