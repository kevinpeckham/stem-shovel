import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../../../../tests/helpers/fakeServerModules";
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
import { FILE_MAX_BYTES } from "#lib/constants/fileFormats.js";
import { MAX_EVENT_PHOTOS } from "#lib/constants/eventFiles.js";

/**
 * Step 1 of a poster's or photo's upload: an editor of the event's account
 * reserves the row under the event; a poster is a PDF or an image, a photo
 * an image, with the attachments' ceilings.
 */
const { POST } = await import("./+server");

const EVENT = fakeId("event-one");
const FILE = fakeId("evfile-one");
const body = { kind: "poster", filename: "Poster.pdf", sizeBytes: 300_000 };
const photoBody = { kind: "photo", filename: "crowd.jpg", sizeBytes: 2_000_000 };
const row = { id: FILE, pathname: `accounts/${ACCOUNT}/events/${EVENT}/files/${FILE}.pdf` };
const post = (b: unknown = body, locals = asEditorOf(ACCOUNT)) =>
	callRoute(POST, locals, jsonPost(`/api/events/${EVENT}/files`, b), { id: EVENT });
const relocate = (await import("#lib/server/relocate.js")) as unknown as Mocks;

beforeEach(() => {
	resetRemoteMocks();
	givenRow("event", { accountId: ACCOUNT });
	data.storageRoom.mockResolvedValue({ ok: true });
	data.createEventFile.mockResolvedValue(row);
	data.eventKindOf.mockResolvedValue("show");
	relocate.accessOfPathname.mockResolvedValue("public");
});

describe("POST /api/events/[id]/files", () => {
	it("400 for a body that is not JSON or lacks a kind, filename or numeric size", async () => {
		await expect(post("{not json")).rejects.toMatchObject(httpError(400));
		await expect(post({ ...body, kind: "video" })).rejects.toMatchObject(httpError(400));
		await expect(post({ ...body, filename: "" })).rejects.toMatchObject(httpError(400));
		await expect(post({ ...body, sizeBytes: "300000" })).rejects.toMatchObject(httpError(400));
		await expect(post({ ...body, sizeBytes: 1.5 })).rejects.toMatchObject(httpError(400));
		await expect(post({ ...body, sizeBytes: 0 })).rejects.toMatchObject(httpError(400));
		expect(data.createEventFile).not.toHaveBeenCalled();
	});
	it("401 signed out, 404 for an outsider and for a viewer", async () => {
		await expect(post(body, asSignedOut())).rejects.toMatchObject(httpError(401));
		await expect(post(body, asOutsider())).rejects.toMatchObject(httpError(404));
		await expect(post(body, asViewerOf(ACCOUNT))).rejects.toMatchObject(httpError(404));
		expect(data.createEventFile).not.toHaveBeenCalled();
	});
	it("415 for a poster that is not a PDF or an image, and a photo that is not an image", async () => {
		await expect(post({ ...body, filename: "poster.mp3" })).rejects.toMatchObject({
			status: 415,
			body: { message: "A poster is a PDF or an image" },
		});
		await expect(post({ ...photoBody, filename: "crowd.pdf" })).rejects.toMatchObject({
			status: 415,
			body: { message: "A photo is an image" },
		});
		expect(data.createEventFile).not.toHaveBeenCalled();
	});
	it("413 over the ceiling of the file's kind, in the attachments' words", async () => {
		await expect(post({ ...body, sizeBytes: FILE_MAX_BYTES.pdf + 1 })).rejects.toMatchObject({
			status: 413,
			body: { message: expect.stringContaining("A PDF file can be up to") },
		});
		await expect(post({ ...photoBody, sizeBytes: FILE_MAX_BYTES.image + 1 })).rejects.toMatchObject(
			{
				status: 413,
				body: { message: expect.stringContaining("An Image file can be up to") },
			},
		);
	});
	it("404 for an unknown event, from the access check or the data layer", async () => {
		givenRow("event", null);
		await expect(post()).rejects.toMatchObject(httpError(404));
		givenRow("event", { accountId: ACCOUNT });
		data.createEventFile.mockResolvedValue(null);
		await expect(post()).rejects.toMatchObject(httpError(404));
	});
	it("409 when the account's storage is full", async () => {
		data.storageRoom.mockResolvedValue({ ok: false, used: 1, limit: 1 });
		await expect(post()).rejects.toMatchObject({
			status: 409,
			body: { message: expect.stringContaining("storage is full") },
		});
		expect(data.storageRoom).toHaveBeenCalledWith(ACCOUNT, 300_000);
		expect(data.createEventFile).not.toHaveBeenCalled();
	});
	it(`409 at ${MAX_EVENT_PHOTOS} photos, named by the event's kind`, async () => {
		data.createEventFile.mockResolvedValue("full");
		await expect(post(photoBody)).rejects.toMatchObject({
			status: 409,
			body: { message: `A show can have at most ${MAX_EVENT_PHOTOS} photos` },
		});
		data.eventKindOf.mockResolvedValue("practice");
		await expect(post(photoBody)).rejects.toMatchObject({
			body: { message: `A practice can have at most ${MAX_EVENT_PHOTOS} photos` },
		});
		expect(data.eventKindOf).toHaveBeenCalledWith(ACCOUNT, EVENT);
	});
	it("an editor reserves the poster and learns where to upload; the storage check runs in the background", async () => {
		const res = await post();
		expect(await res.json()).toEqual({ fileId: FILE, pathname: row.pathname, access: "public" });
		expect(data.createEventFile).toHaveBeenCalledWith({
			accountId: ACCOUNT,
			userId: USER,
			eventId: EVENT,
			kind: "poster",
			filename: "Poster.pdf",
			sizeBytes: 300_000,
		});
		expect(relocate.accessOfPathname).toHaveBeenCalledWith(row.pathname);
		expect(background).toHaveBeenCalledTimes(1);
		await background.mock.calls[0][0]();
		expect(notifications.checkStorage).toHaveBeenCalledWith(ACCOUNT);
	});
	it("an image poster and an image photo pass; an admin may reserve too", async () => {
		expect((await post({ ...body, filename: "poster.png" })).status).toBe(200);
		expect((await post(photoBody, asAdminOf(ACCOUNT))).status).toBe(200);
		expect(data.createEventFile).toHaveBeenLastCalledWith(
			expect.objectContaining({ kind: "photo", filename: "crowd.jpg" }),
		);
	});
});
