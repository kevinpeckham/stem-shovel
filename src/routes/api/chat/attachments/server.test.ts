import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	OTHER_USER,
	USER,
	asEditorOf,
	asOutsider,
	asSignedOut,
	asViewerOf,
	fakeId,
	httpError,
} from "../../../../../tests/helpers/fakeRequestEvent";
import {
	data,
	givenRow,
	resetRemoteMocks,
	type Mocks,
} from "../../../../../tests/helpers/fakeServerModules";
import { callRoute, jsonPost } from "../../../../../tests/helpers/fakeApiEvent";
import { FILE_MAX_BYTES } from "#lib/constants/fileFormats.js";

/**
 * Step 1 of a chat attachment's upload (docs/chat.md, "Attachments"):
 * anyone who writes in the chat reserves a file of any kind under the
 * attachments' ceilings, in the account's storage.
 */
const { POST } = await import("./+server");

const SONG = fakeId("song-one");
const SESSION = fakeId("session-one");
const PROJECT = fakeId("proj-one");
const FILE = fakeId("chatfile-one");
const body = { songId: SONG, filename: "shot.png", sizeBytes: 300_000 };
const row = { id: FILE, pathname: `accounts/${ACCOUNT}/chat/${FILE}.png` };
const post = (b: unknown = body, locals = asEditorOf(ACCOUNT)) =>
	callRoute(POST, locals, jsonPost("/api/chat/attachments", b));
const relocate = (await import("#lib/server/relocate.js")) as unknown as Mocks;

beforeEach(() => {
	resetRemoteMocks();
	givenRow("song", { accountId: ACCOUNT, projectId: PROJECT });
	givenRow("recordingSession", { accountId: ACCOUNT });
	givenRow("account", { slug: "band", name: "Band" });
	data.storageRoom.mockResolvedValue({ ok: true });
	data.createChatAttachment.mockResolvedValue(row);
	relocate.accessOfPathname.mockResolvedValue("public");
});

describe("POST /api/chat/attachments", () => {
	it("400 for a body that is not JSON, lacks a filename or a numeric size, or names no chat or two", async () => {
		await expect(post("{not json")).rejects.toMatchObject(httpError(400));
		await expect(post({ ...body, filename: "" })).rejects.toMatchObject(httpError(400));
		await expect(post({ ...body, sizeBytes: "300000" })).rejects.toMatchObject(httpError(400));
		await expect(post({ ...body, sizeBytes: 0 })).rejects.toMatchObject(httpError(400));
		await expect(post({ filename: "a.png", sizeBytes: 1 })).rejects.toMatchObject(httpError(400));
		await expect(post({ ...body, sessionId: SESSION })).rejects.toMatchObject(httpError(400));
		expect(data.createChatAttachment).not.toHaveBeenCalled();
	});
	it("413 over the ceiling of the file's kind, before any lookup", async () => {
		await expect(post({ ...body, sizeBytes: FILE_MAX_BYTES.image + 1 })).rejects.toMatchObject({
			status: 413,
			body: { message: expect.stringContaining("A Image file can be up to") },
		});
		await expect(
			post({ ...body, filename: "a.bin", sizeBytes: FILE_MAX_BYTES.other + 1 }),
		).rejects.toMatchObject({
			status: 413,
			body: { message: expect.stringContaining("A file can be up to") },
		});
		expect(data.storageRoom).not.toHaveBeenCalled();
	});
	it("401 signed out, 404 for an outsider", async () => {
		await expect(post(body, asSignedOut())).rejects.toMatchObject(httpError(401));
		await expect(post(body, asOutsider())).rejects.toMatchObject(httpError(404));
		expect(data.createChatAttachment).not.toHaveBeenCalled();
	});
	it("a viewer of the account reserves under the song and learns where to upload", async () => {
		const res = await post(body, asViewerOf(ACCOUNT));
		expect(await res.json()).toEqual({ fileId: FILE, pathname: row.pathname, access: "public" });
		expect(data.createChatAttachment).toHaveBeenCalledWith({
			accountId: ACCOUNT,
			userId: USER,
			songId: SONG,
			filename: "shot.png",
			sizeBytes: 300_000,
		});
		expect(data.storageRoom).toHaveBeenCalledWith(ACCOUNT, 300_000);
		expect(relocate.accessOfPathname).toHaveBeenCalledWith(row.pathname);
	});
	it("a project viewer from outside the account reserves under the song's account", async () => {
		data.projectRoleOf.mockResolvedValue("viewer");
		await post(body, asOutsider());
		expect(data.createChatAttachment).toHaveBeenCalledWith(
			expect.objectContaining({ accountId: ACCOUNT, userId: OTHER_USER, songId: SONG }),
		);
	});
	it("a session's chat: a member of the account, any kind of file", async () => {
		await post({ sessionId: SESSION, filename: "set.xyz", sizeBytes: 10 }, asViewerOf(ACCOUNT));
		expect(data.createChatAttachment).toHaveBeenCalledWith({
			accountId: ACCOUNT,
			userId: USER,
			sessionId: SESSION,
			filename: "set.xyz",
			sizeBytes: 10,
		});
	});
	it("409 when the account's storage is full", async () => {
		data.storageRoom.mockResolvedValue({ ok: false, used: 1, limit: 1 });
		await expect(post()).rejects.toMatchObject({
			status: 409,
			body: { message: expect.stringContaining("storage is full") },
		});
		expect(data.createChatAttachment).not.toHaveBeenCalled();
	});
	it("404 when the data layer finds no song or session", async () => {
		data.createChatAttachment.mockResolvedValue(null);
		await expect(post()).rejects.toMatchObject({
			status: 404,
			body: { message: "Song not found" },
		});
		await expect(
			post({ sessionId: SESSION, filename: "a.png", sizeBytes: 1 }),
		).rejects.toMatchObject({ status: 404, body: { message: "Session not found" } });
	});
});
