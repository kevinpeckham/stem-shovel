import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { CHAT_ATTACHMENT_STALE_MS } from "#lib/constants/chatAttachments.js";
import { blob, callsTo, fake, reset } from "../../../tests/helpers/fakeDataLayer";

/**
 * Files on chat messages (docs/chat.md, "Attachments"): the reserve with
 * its self-cleaning sweep, the lifecycle to ready, the composer's ×, the
 * attach at send, the reading with the messages, the delete with a message,
 * the permanent link, the storage and the blobs of the bigger deletes.
 */
const {
	attachChatAttachments,
	chatAttachmentByShareCode,
	chatAttachmentsOf,
	createChatAttachment,
	createChatMessage,
	createSessionChatMessage,
	deleteAccount,
	deleteChatMessage,
	deleteRecordingSession,
	deleteSessionChatMessage,
	deleteSong,
	deleteUser,
	failChatAttachment,
	findChatAttachmentById,
	findUploadingChatAttachment,
	listChatMessages,
	markChatAttachmentReady,
	recordChatAttachmentUrl,
	removePendingChatAttachment,
} = await import("./data");

const A = "acct-one____________";
const B = "acct-two____________";
const U = "user-one____________";
const V = "user-two____________";
const NOW = new Date("2026-11-07T12:00:00Z");
const at = (ms: number) => new Date(NOW.getTime() - ms);

const file = (id: string, over: Record<string, unknown> = {}) => ({
	id,
	accountId: A,
	songId: "s1",
	sessionId: null,
	messageId: null,
	sessionMessageId: null,
	kind: "image",
	status: "ready",
	url: `https://blob/${id}.png`,
	pathname: `accounts/${A}/chat/${id}.png`,
	filename: `${id}.png`,
	contentType: "image/png",
	sizeBytes: 1000,
	width: null,
	height: null,
	thumbnailUrl: null,
	thumbnailPathname: null,
	shareCode: `code-${id}`,
	uploadedBy: U,
	createdAt: at(1000),
	updatedAt: at(1000),
	...over,
});
const ids = (table: "chatAttachment") => fake.rows(table).map((r) => String(r.id));
const song = { id: "s1", accountId: A };
const session = { id: "x1", accountId: A };

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("createChatAttachment", () => {
	beforeEach(() => reset({ song: [song], recordingSession: [session] }));
	test("a song chat's file: uploading, its kind and type from the extension, under the account's chat folder, a share code", async () => {
		const row = await createChatAttachment({
			accountId: A,
			userId: U,
			songId: "s1",
			filename: "Score.PDF",
			sizeBytes: 5000,
		});
		expect(row).toMatchObject({
			accountId: A,
			songId: "s1",
			sessionId: null,
			messageId: null,
			sessionMessageId: null,
			kind: "pdf",
			status: "uploading",
			url: "",
			pathname: `accounts/${A}/chat/${row!.id}.pdf`,
			filename: "Score.PDF",
			contentType: "application/pdf",
			sizeBytes: 5000,
			uploadedBy: U,
		});
		expect(row!.shareCode).toHaveLength(16);
	});
	test("a session chat's file has the session and no song; any kind goes, 'other' included", async () => {
		const row = await createChatAttachment({
			accountId: A,
			userId: U,
			songId: "s1",
			sessionId: "x1",
			filename: "notes.xyz",
			sizeBytes: 5,
		});
		expect(row).toMatchObject({ songId: null, sessionId: "x1", kind: "other" });
	});
	test("null for another account's song or session, or for none", async () => {
		expect(
			await createChatAttachment({
				accountId: B,
				userId: U,
				songId: "s1",
				filename: "a.png",
				sizeBytes: 1,
			}),
		).toBeNull();
		expect(
			await createChatAttachment({
				accountId: B,
				userId: U,
				sessionId: "x1",
				filename: "a.png",
				sizeBytes: 1,
			}),
		).toBeNull();
		expect(
			await createChatAttachment({ accountId: A, userId: U, filename: "a.png", sizeBytes: 1 }),
		).toBeNull();
		expect(callsTo("insert", "chat_attachment")).toHaveLength(0);
	});
	test("first the user's unsent files in the account older than a day go, rows and blobs; nobody else's, nothing sent, nothing fresh", async () => {
		const old = at(CHAT_ATTACHMENT_STALE_MS + 1);
		reset({
			song: [song],
			chatAttachment: [
				file("stale", { createdAt: old, thumbnailUrl: "https://blob/stale.webp" }),
				file("fresh", { createdAt: at(CHAT_ATTACHMENT_STALE_MS - 1000) }),
				file("sent", { createdAt: old, messageId: "m1" }),
				file("theirs", { createdAt: old, uploadedBy: V }),
				file("elsewhere", { createdAt: old, accountId: B }),
			],
		});
		await createChatAttachment({
			accountId: A,
			userId: U,
			songId: "s1",
			filename: "a.png",
			sizeBytes: 1,
		});
		expect(ids("chatAttachment").slice(0, 4)).toEqual(["fresh", "sent", "theirs", "elsewhere"]);
		expect(blob.deleteBlobs).toHaveBeenCalledWith([
			"https://blob/stale.png",
			"https://blob/stale.webp",
		]);
	});
});

describe("the lifecycle", () => {
	beforeEach(() =>
		reset({
			chatAttachment: [
				file("f1", { status: "uploading", url: "" }),
				file("f2", { accountId: B, status: "uploading", url: "" }),
			],
		}),
	);
	test("findChatAttachmentById and findUploadingChatAttachment are scoped by the account", async () => {
		expect((await findChatAttachmentById(A, "f1"))?.id).toBe("f1");
		expect(await findChatAttachmentById(A, "f2")).toBeNull();
		expect((await findUploadingChatAttachment(A, `accounts/${A}/chat/f1.png`))?.id).toBe("f1");
		expect(await findUploadingChatAttachment(B, `accounts/${A}/chat/f1.png`)).toBeNull();
	});
	test("recordChatAttachmentUrl fills an uploading row only", async () => {
		await recordChatAttachmentUrl(`accounts/${A}/chat/f1.png`, "https://blob/f1.png");
		expect(fake.rows("chatAttachment")[0].url).toBe("https://blob/f1.png");
		fake.rows("chatAttachment")[0].status = "ready";
		await recordChatAttachmentUrl(`accounts/${A}/chat/f1.png`, "https://blob/other.png");
		expect(fake.rows("chatAttachment")[0].url).toBe("https://blob/f1.png");
	});
	test("markChatAttachmentReady: the row as the chat reads it; null for another account's", async () => {
		const ready = await markChatAttachmentReady(A, "f1", {
			url: "https://blob/f1.png",
			thumbnailUrl: "https://blob/f1.webp",
			thumbnailPathname: "f1.webp",
			width: 800,
			height: 600,
		});
		expect(ready).toEqual({
			id: "f1",
			filename: "f1.png",
			kind: "image",
			contentType: "image/png",
			sizeBytes: 1000,
			url: "https://blob/f1.png",
			thumbnailUrl: "https://blob/f1.webp",
			width: 800,
			height: 600,
			shareCode: "code-f1",
		});
		expect(fake.rows("chatAttachment")[0].status).toBe("ready");
		expect(
			await markChatAttachmentReady(B, "f1", {
				url: "x",
				thumbnailUrl: null,
				thumbnailPathname: null,
				width: null,
				height: null,
			}),
		).toBeNull();
	});
	test("failChatAttachment removes the row and whatever landed", async () => {
		await failChatAttachment(A, "f1");
		expect(ids("chatAttachment")).toEqual(["f2"]);
		expect(blob.deleteBlobs).toHaveBeenCalledWith(["", ""]);
		await failChatAttachment(A, "f2");
		expect(ids("chatAttachment")).toEqual(["f2"]);
	});
	test("chatAttachmentByShareCode: a ready file with its stored type; not one still uploading", async () => {
		expect(await chatAttachmentByShareCode("code-f1")).toBeNull();
		fake.rows("chatAttachment")[0].status = "ready";
		expect(await chatAttachmentByShareCode("code-f1")).toEqual({
			url: "",
			filename: "f1.png",
			contentType: "image/png",
			kind: "image",
		});
	});
});

describe("removePendingChatAttachment", () => {
	beforeEach(() =>
		reset({
			chatAttachment: [
				file("mine", { thumbnailUrl: "https://blob/mine.webp" }),
				file("sent", { messageId: "m1" }),
				file("theirs", { uploadedBy: V }),
			],
		}),
	);
	test("the uploader's own unsent file goes, row and blobs", async () => {
		expect(await removePendingChatAttachment(A, U, "mine")).toBe(true);
		expect(ids("chatAttachment")).toEqual(["sent", "theirs"]);
		expect(blob.deleteBlobs).toHaveBeenCalledWith([
			"https://blob/mine.png",
			"https://blob/mine.webp",
		]);
	});
	test("false for a sent file, another's, another account's", async () => {
		expect(await removePendingChatAttachment(A, U, "sent")).toBe(false);
		expect(await removePendingChatAttachment(A, U, "theirs")).toBe(false);
		expect(await removePendingChatAttachment(B, U, "mine")).toBe(false);
		expect(ids("chatAttachment")).toHaveLength(3);
		expect(blob.deleteBlobs).not.toHaveBeenCalled();
	});
});

describe("attachChatAttachments and the send", () => {
	beforeEach(() =>
		reset({
			user: [{ id: U, name: "Pat" }],
			song: [song],
			recordingSession: [session],
			chatMessage: [],
			sessionChatMessage: [],
			chatAttachment: [
				file("ok1", { createdAt: at(2000) }),
				file("ok2"),
				file("uploading", { status: "uploading" }),
				file("theirs", { uploadedBy: V }),
				file("sent", { messageId: "m0" }),
				file("other-song", { songId: "s2" }),
				file("in-session", { songId: null, sessionId: "x1" }),
			],
		}),
	);
	test("of the ids, only the sender's ready, unsent files of this chat join the message", async () => {
		const all = ids("chatAttachment");
		expect(await attachChatAttachments(A, { songId: "s1" }, U, "m1", all)).toBe(2);
		const byId = new Map(fake.rows("chatAttachment").map((r) => [r.id, r.messageId]));
		expect(byId.get("ok1")).toBe("m1");
		expect(byId.get("ok2")).toBe("m1");
		expect(byId.get("uploading")).toBeNull();
		expect(byId.get("theirs")).toBeNull();
		expect(byId.get("sent")).toBe("m0");
		expect(byId.get("other-song")).toBeNull();
		expect(byId.get("in-session")).toBeNull();
		expect(await attachChatAttachments(B, { songId: "s1" }, U, "m2", all)).toBe(0);
		expect(await attachChatAttachments(A, {}, U, "m2", all)).toBe(0);
		expect(await attachChatAttachments(A, { songId: "s1" }, U, "m2", [])).toBe(0);
	});
	test("a session's chat sets the session message's id", async () => {
		expect(
			await attachChatAttachments(A, { sessionId: "x1" }, U, "sm1", ["in-session", "ok1"]),
		).toBe(1);
		const row = fake.rows("chatAttachment").find((r) => r.id === "in-session");
		expect(row).toMatchObject({ sessionMessageId: "sm1", messageId: null });
	});
	test("createChatMessage attaches the files and the row comes back carrying them, oldest first", async () => {
		const made = await createChatMessage(A, "s1", U, "", [], ["ok2", "ok1", "theirs"]);
		if (!made || made === "empty") throw new Error("no message");
		expect(made.attachments.map((f) => f.id)).toEqual(["ok1", "ok2"]);
		expect(made.body).toBe("");
		// The list reads them too, and a message without files has none.
		await createChatMessage(A, "s1", U, "plain");
		const listed = await listChatMessages("s1");
		expect(Object.fromEntries(listed.map((m) => [m.body, m.attachments.length]))).toEqual({
			"": 2,
			plain: 0,
		});
	});
	test("createSessionChatMessage does the same in a session's chat", async () => {
		const made = await createSessionChatMessage(A, "x1", U, "look", [], ["in-session"]);
		if (!made || made === "empty") throw new Error("no message");
		expect(made.attachments.map((f) => f.id)).toEqual(["in-session"]);
	});
	test("files alone, none of them the sender's: no message is kept", async () => {
		const made = await createChatMessage(A, "s1", U, "", [], ["theirs"]);
		expect(made).toBe("empty");
		expect(fake.rows("chatMessage")).toHaveLength(0);
	});
});

describe("chatAttachmentsOf", () => {
	test("ready files only, by either chat's message id; no ids asks nothing", async () => {
		reset({
			chatAttachment: [
				file("a", { messageId: "m1" }),
				file("b", { messageId: "m1", status: "uploading" }),
				file("c", { sessionMessageId: "sm1", songId: null, sessionId: "x1" }),
			],
		});
		const out = await chatAttachmentsOf(["m1", "sm1", "m9"]);
		expect(out.get("m1")?.map((f) => f.id)).toEqual(["a"]);
		expect(out.get("sm1")?.map((f) => f.id)).toEqual(["c"]);
		expect(out.has("m9")).toBe(false);
		fake.calls.length = 0;
		expect((await chatAttachmentsOf([])).size).toBe(0);
		expect(fake.calls).toHaveLength(0);
	});
});

describe("deletes take the files' blobs", () => {
	test("deleteChatMessage and deleteSessionChatMessage remove their files, rows and blobs; editing leaves them", async () => {
		reset({
			chatMessage: [{ id: "m1", accountId: A, songId: "s1", userId: U, body: "" }],
			sessionChatMessage: [{ id: "sm1", accountId: A, sessionId: "x1", userId: U, body: "" }],
			chatAttachment: [
				file("a", { messageId: "m1", thumbnailUrl: "https://blob/a.webp" }),
				file("b", { sessionMessageId: "sm1" }),
				file("c", { messageId: "m2" }),
			],
		});
		await deleteChatMessage("m1");
		expect(ids("chatAttachment")).toEqual(["b", "c"]);
		expect(blob.deleteBlobs).toHaveBeenCalledWith(["https://blob/a.png", "https://blob/a.webp"]);
		await deleteSessionChatMessage("sm1");
		expect(ids("chatAttachment")).toEqual(["c"]);
		expect(blob.deleteBlobs).toHaveBeenLastCalledWith(["https://blob/b.png", ""]);
	});
	test("deleteSong, deleteRecordingSession and deleteAccount gather their chats' files", async () => {
		reset({
			account: [{ id: A }],
			song: [song],
			recordingSession: [session],
			chatAttachment: [
				file("bySong"),
				file("bySession", { songId: null, sessionId: "x1" }),
				file("otherSong", { songId: "s2" }),
			],
		});
		const urls = () => (blob.deleteBlobs.mock.calls as unknown as string[][][]).at(-1)?.[0] ?? [];
		await deleteSong(A, "s1");
		expect(urls()).toContain("https://blob/bySong.png");
		expect(urls()).not.toContain("https://blob/otherSong.png");
		await deleteRecordingSession(A, "x1");
		expect(urls()).toContain("https://blob/bySession.png");
		expect(urls()).not.toContain("https://blob/bySong.png");
		await deleteAccount(A);
		expect(urls()).toEqual(
			expect.arrayContaining([
				"https://blob/bySong.png",
				"https://blob/bySession.png",
				"https://blob/otherSong.png",
			]),
		);
	});
	test("deleteUser gathers the files on their messages and their unsent ones, nobody else's", async () => {
		reset({
			user: [{ id: U }, { id: V }],
			chatMessage: [
				{ id: "m1", accountId: A, songId: "s1", userId: U },
				{ id: "m2", accountId: A, songId: "s1", userId: V },
			],
			sessionChatMessage: [{ id: "sm1", accountId: A, sessionId: "x1", userId: U }],
			chatAttachment: [
				file("onMine", { messageId: "m1" }),
				file("onMySession", { sessionMessageId: "sm1", songId: null, sessionId: "x1" }),
				file("unsent"),
				file("onTheirs", { messageId: "m2", uploadedBy: V }),
				file("theirUnsent", { uploadedBy: V }),
			],
		});
		await deleteUser(U);
		expect(blob.deleteBlobs).toHaveBeenCalledWith([
			"https://blob/onMine.png",
			"",
			"https://blob/onMySession.png",
			"",
			"https://blob/unsent.png",
			"",
		]);
	});
});
