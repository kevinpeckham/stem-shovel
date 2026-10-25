import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	OTHER_ACCOUNT,
	OTHER_USER,
	USER,
	asAdminOf,
	asEditorOf,
	asMemberOf,
	asOutsider,
	asSignedOut,
	asViewerOf,
	call,
	fakeId,
	httpError,
} from "../../../tests/helpers/fakeRequestEvent";
import {
	background,
	data,
	givenRow,
	notifications,
	resetRemoteMocks,
} from "../../../tests/helpers/fakeServerModules";

/**
 * Authorization of the chat remote functions (docs/chat.md): anyone on the
 * song as a member reads, writes and marks it read, project viewers
 * included; the author edits; the author or an owner / admin deletes;
 * anyone who reads reacts, and a mention names only the chat's people.
 */
const chat = await import("./chat.remote");

const SONG = fakeId("song-one");
const PROJECT = fakeId("proj-one");
const MESSAGE = fakeId("message-one");
const ROW = {
	id: MESSAGE,
	userId: USER,
	authorName: "Pat",
	body: "Louder bass",
	createdAt: 1,
	updatedAt: 1,
	editedAt: null,
	mentions: [],
	reactions: [],
};

beforeEach(() => {
	resetRemoteMocks();
	givenRow("song", { accountId: ACCOUNT, projectId: PROJECT });
	givenRow("account", { slug: "band", name: "Band" });
});

describe("sendMessage", () => {
	const input = { songId: SONG, body: "Louder bass" };
	beforeEach(() => data.createChatMessage.mockResolvedValue(ROW));
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(chat.sendMessage, input)).rejects.toMatchObject(httpError(401));
	});
	it("404 for a stranger to the account", async () => {
		asOutsider();
		await expect(call(chat.sendMessage, input)).rejects.toMatchObject(httpError(404));
		expect(data.createChatMessage).not.toHaveBeenCalled();
	});
	it("a viewer of the account writes", async () => {
		asViewerOf(ACCOUNT);
		await expect(call(chat.sendMessage, input)).resolves.toEqual({ message: ROW });
		expect(data.createChatMessage).toHaveBeenCalledWith(ACCOUNT, SONG, USER, "Louder bass", []);
	});
	it("a project viewer from outside the account writes under the song's account", async () => {
		asOutsider();
		data.projectRoleOf.mockResolvedValue("viewer");
		await expect(call(chat.sendMessage, input)).resolves.toEqual({ message: ROW });
		expect(data.createChatMessage).toHaveBeenCalledWith(
			ACCOUNT,
			SONG,
			OTHER_USER,
			"Louder bass",
			[],
		);
	});
	it("a member not added to a restricted project may not", async () => {
		asEditorOf(ACCOUNT);
		data.projectRestricted.mockResolvedValue(true);
		await expect(call(chat.sendMessage, input)).rejects.toMatchObject(httpError(404));
	});
	it("an empty message is refused by the schema", async () => {
		asEditorOf(ACCOUNT);
		await expect(call(chat.sendMessage, { songId: SONG, body: "   " })).rejects.toBeDefined();
		expect(data.createChatMessage).not.toHaveBeenCalled();
	});
});

describe("editMessage", () => {
	const input = { id: MESSAGE, body: "Softer bass" };
	beforeEach(() => {
		data.chatMessageOwnership.mockResolvedValue({
			id: MESSAGE,
			songId: SONG,
			accountId: ACCOUNT,
			userId: USER,
		});
		data.updateChatMessage.mockResolvedValue({ ...ROW, body: "Softer bass", editedAt: 2 });
	});
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(chat.editMessage, input)).rejects.toMatchObject(httpError(401));
	});
	it("403 for anyone but the author, an owner of the account included", async () => {
		asMemberOf(ACCOUNT, "owner", { userId: OTHER_USER });
		await expect(call(chat.editMessage, input)).rejects.toMatchObject(httpError(403));
		expect(data.updateChatMessage).not.toHaveBeenCalled();
	});
	it("404 for a message that does not exist", async () => {
		asEditorOf(ACCOUNT);
		data.chatMessageOwnership.mockResolvedValue(null);
		await expect(call(chat.editMessage, input)).rejects.toMatchObject(httpError(404));
	});
	it("the author edits it", async () => {
		asEditorOf(ACCOUNT);
		await expect(call(chat.editMessage, input)).resolves.toEqual({
			message: { ...ROW, body: "Softer bass", editedAt: 2 },
		});
		expect(data.updateChatMessage).toHaveBeenCalledWith(MESSAGE, "Softer bass", []);
	});
});

describe("deleteMessage", () => {
	const input = { id: MESSAGE };
	beforeEach(() =>
		data.chatMessageOwnership.mockResolvedValue({
			id: MESSAGE,
			songId: SONG,
			accountId: ACCOUNT,
			userId: OTHER_USER,
		}),
	);
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(chat.deleteMessage, input)).rejects.toMatchObject(httpError(401));
	});
	it("403 for a member who is not the author", async () => {
		asMemberOf(ACCOUNT, "member");
		await expect(call(chat.deleteMessage, input)).rejects.toMatchObject(httpError(403));
		expect(data.deleteChatMessage).not.toHaveBeenCalled();
	});
	it("404 for an admin of a different account, who may not see the song", async () => {
		asAdminOf(OTHER_ACCOUNT);
		await expect(call(chat.deleteMessage, input)).rejects.toMatchObject(httpError(404));
		expect(data.deleteChatMessage).not.toHaveBeenCalled();
	});
	it("the author deletes it", async () => {
		asMemberOf(ACCOUNT, "member", { userId: OTHER_USER });
		await expect(call(chat.deleteMessage, input)).resolves.toEqual({ deleted: true });
		expect(data.deleteChatMessage).toHaveBeenCalledWith(MESSAGE);
	});
	it("an admin of the account deletes it", async () => {
		asAdminOf(ACCOUNT);
		await expect(call(chat.deleteMessage, input)).resolves.toEqual({ deleted: true });
		expect(data.deleteChatMessage).toHaveBeenCalledWith(MESSAGE);
	});
});

describe("markChatRead and chatSince", () => {
	beforeEach(() => {
		data.markChatRead.mockResolvedValue(1234);
		data.listChatMessages.mockResolvedValue([ROW]);
	});
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(chat.markChatRead, { songId: SONG })).rejects.toMatchObject(httpError(401));
		await expect(call(chat.chatSince, { songId: SONG })).rejects.toMatchObject(httpError(401));
	});
	it("404 for a stranger to the account", async () => {
		asOutsider();
		await expect(call(chat.markChatRead, { songId: SONG })).rejects.toMatchObject(httpError(404));
		await expect(call(chat.chatSince, { songId: SONG, after: 5 })).rejects.toMatchObject(
			httpError(404),
		);
		expect(data.listChatMessages).not.toHaveBeenCalled();
	});
	it("a viewer marks the chat read and polls for what changed since", async () => {
		asViewerOf(ACCOUNT);
		await expect(call(chat.markChatRead, { songId: SONG })).resolves.toEqual({ readAt: 1234 });
		expect(data.markChatRead).toHaveBeenCalledWith(SONG, USER);
		await expect(call(chat.chatSince, { songId: SONG, after: 5 })).resolves.toEqual([ROW]);
		expect(data.listChatMessages).toHaveBeenCalledWith(SONG, 5, USER);
	});
});

describe('a session\'s chat (docs/chat.md, "Sessions")', () => {
	const SESSION = fakeId("session-one");
	beforeEach(() => {
		givenRow("recordingSession", { accountId: ACCOUNT });
		data.createSessionChatMessage.mockResolvedValue(ROW);
		data.listSessionChatMessages.mockResolvedValue([ROW]);
		data.markSessionChatRead.mockResolvedValue(99);
	});
	it("a message names a song or a session, not both and not neither", async () => {
		asEditorOf(ACCOUNT);
		await expect(call(chat.sendMessage, { body: "Hi" })).rejects.toMatchObject(httpError(400));
		await expect(
			call(chat.sendMessage, { songId: SONG, sessionId: SESSION, body: "Hi" }),
		).rejects.toMatchObject(httpError(400));
		expect(data.createChatMessage).not.toHaveBeenCalled();
		expect(data.createSessionChatMessage).not.toHaveBeenCalled();
	});
	it("a member of the account writes under the session, and the account hears of it", async () => {
		asViewerOf(ACCOUNT);
		await expect(call(chat.sendMessage, { sessionId: SESSION, body: "Hi" })).resolves.toEqual({
			message: ROW,
		});
		expect(data.createSessionChatMessage).toHaveBeenCalledWith(ACCOUNT, SESSION, USER, "Hi", []);
		expect(data.createChatMessage).not.toHaveBeenCalled();
	});
	it("404 for a stranger to the account", async () => {
		asOutsider();
		await expect(call(chat.sendMessage, { sessionId: SESSION, body: "Hi" })).rejects.toMatchObject(
			httpError(404),
		);
		await expect(call(chat.chatSince, { sessionId: SESSION })).rejects.toMatchObject(
			httpError(404),
		);
	});
	it("reads, polls and marks the session's chat", async () => {
		asEditorOf(ACCOUNT);
		await expect(call(chat.chatSince, { sessionId: SESSION, after: 7 })).resolves.toEqual([ROW]);
		expect(data.listSessionChatMessages).toHaveBeenCalledWith(SESSION, 7, USER);
		await expect(call(chat.markChatRead, { sessionId: SESSION })).resolves.toEqual({ readAt: 99 });
		expect(data.markSessionChatRead).toHaveBeenCalledWith(SESSION, USER);
	});
	it("a session message is edited and deleted through the same forms, found in its own table", async () => {
		data.chatMessageOwnership.mockResolvedValue(null);
		data.sessionChatMessageOwnership.mockResolvedValue({
			id: MESSAGE,
			sessionId: SESSION,
			accountId: ACCOUNT,
			userId: USER,
		});
		data.updateSessionChatMessage.mockResolvedValue({ ...ROW, body: "Edited", editedAt: 2 });
		asEditorOf(ACCOUNT);
		await expect(call(chat.editMessage, { id: MESSAGE, body: "Edited" })).resolves.toEqual({
			message: { ...ROW, body: "Edited", editedAt: 2 },
		});
		expect(data.updateSessionChatMessage).toHaveBeenCalledWith(MESSAGE, "Edited", []);
		await expect(call(chat.deleteMessage, { id: MESSAGE })).resolves.toEqual({ deleted: true });
		expect(data.deleteSessionChatMessage).toHaveBeenCalledWith(MESSAGE);
		expect(data.deleteChatMessage).not.toHaveBeenCalled();
	});
});

describe('a session\'s chat (docs/chat.md, "Sessions")', () => {
	const SESSION = fakeId("session-one");
	beforeEach(() => {
		givenRow("recordingSession", { accountId: ACCOUNT });
		data.createSessionChatMessage.mockResolvedValue(ROW);
		data.listSessionChatMessages.mockResolvedValue([ROW]);
		data.markSessionChatRead.mockResolvedValue(99);
	});
	it("a message names a song or a session, not both and not neither", async () => {
		asEditorOf(ACCOUNT);
		await expect(call(chat.sendMessage, { body: "Hi" })).rejects.toMatchObject(httpError(400));
		await expect(
			call(chat.sendMessage, { songId: SONG, sessionId: SESSION, body: "Hi" }),
		).rejects.toMatchObject(httpError(400));
		expect(data.createChatMessage).not.toHaveBeenCalled();
		expect(data.createSessionChatMessage).not.toHaveBeenCalled();
	});
	it("a member of the account writes under the session", async () => {
		asViewerOf(ACCOUNT);
		await expect(call(chat.sendMessage, { sessionId: SESSION, body: "Hi" })).resolves.toEqual({
			message: ROW,
		});
		expect(data.createSessionChatMessage).toHaveBeenCalledWith(ACCOUNT, SESSION, USER, "Hi", []);
		expect(data.createChatMessage).not.toHaveBeenCalled();
	});
	it("404 for a stranger to the account", async () => {
		asOutsider();
		await expect(call(chat.sendMessage, { sessionId: SESSION, body: "Hi" })).rejects.toMatchObject(
			httpError(404),
		);
		await expect(call(chat.chatSince, { sessionId: SESSION })).rejects.toMatchObject(
			httpError(404),
		);
	});
	it("reads, polls and marks the session's chat", async () => {
		asEditorOf(ACCOUNT);
		await expect(call(chat.chatSince, { sessionId: SESSION, after: 7 })).resolves.toEqual([ROW]);
		expect(data.listSessionChatMessages).toHaveBeenCalledWith(SESSION, 7, USER);
		await expect(call(chat.markChatRead, { sessionId: SESSION })).resolves.toEqual({ readAt: 99 });
		expect(data.markSessionChatRead).toHaveBeenCalledWith(SESSION, USER);
	});
	it("a session message is edited and deleted through the same forms, found in its own table", async () => {
		data.chatMessageOwnership.mockResolvedValue(null);
		data.sessionChatMessageOwnership.mockResolvedValue({
			id: MESSAGE,
			sessionId: SESSION,
			accountId: ACCOUNT,
			userId: USER,
		});
		data.updateSessionChatMessage.mockResolvedValue({ ...ROW, body: "Edited", editedAt: 2 });
		asEditorOf(ACCOUNT);
		await expect(call(chat.editMessage, { id: MESSAGE, body: "Edited" })).resolves.toEqual({
			message: { ...ROW, body: "Edited", editedAt: 2 },
		});
		expect(data.updateSessionChatMessage).toHaveBeenCalledWith(MESSAGE, "Edited", []);
		await expect(call(chat.deleteMessage, { id: MESSAGE })).resolves.toEqual({ deleted: true });
		expect(data.deleteSessionChatMessage).toHaveBeenCalledWith(MESSAGE);
		expect(data.deleteChatMessage).not.toHaveBeenCalled();
	});
});

/** Runs the work a remote function handed to `background` (the double only records it). */
async function runBackground() {
	for (const [work] of background.mock.calls) await (work as () => Promise<void>)();
}

describe('mentions (docs/chat.md, "Mentions")', () => {
	const SAM = fakeId("user-sam");
	const STRANGER = fakeId("user-stranger");
	beforeEach(() => {
		data.chatAudience.mockResolvedValue([
			{ id: SAM, name: "Sam" },
			{ id: USER, name: "Pat" },
		]);
		data.createChatMessage.mockResolvedValue(ROW);
	});
	it("a message keeps only the mentions of the chat's people, each once; they hear of it as a mention, not as chat", async () => {
		asEditorOf(ACCOUNT);
		await call(chat.sendMessage, {
			songId: SONG,
			body: "@Sam hi",
			mentions: [SAM, STRANGER, SAM],
		});
		expect(data.chatAudience).toHaveBeenCalledWith(ACCOUNT, { songId: SONG, sessionId: "" });
		expect(data.createChatMessage).toHaveBeenCalledWith(ACCOUNT, SONG, USER, "@Sam hi", [SAM]);
		await runBackground();
		expect(notifications.notifyChat).toHaveBeenCalledWith(ACCOUNT, SONG, USER, [SAM]);
		expect(notifications.notifyMention).toHaveBeenCalledWith(ACCOUNT, "song", SONG, USER, [SAM]);
	});
	it("no mentions: the audience is not asked", async () => {
		asEditorOf(ACCOUNT);
		await call(chat.sendMessage, { songId: SONG, body: "hi" });
		expect(data.chatAudience).not.toHaveBeenCalled();
	});
	it("more than twenty mentions is refused by the schema", async () => {
		asEditorOf(ACCOUNT);
		const many = Array.from({ length: 21 }, (_, i) => fakeId(`u${i}`));
		await expect(
			call(chat.sendMessage, { songId: SONG, body: "all", mentions: many }),
		).rejects.toBeDefined();
		expect(data.createChatMessage).not.toHaveBeenCalled();
	});
	it("an edit stores the mentions it now has and tells only the people newly named", async () => {
		asEditorOf(ACCOUNT);
		const OTHER = fakeId("user-kim");
		data.chatAudience.mockResolvedValue([
			{ id: SAM, name: "Sam" },
			{ id: OTHER, name: "Kim" },
		]);
		data.chatMessageOwnership.mockResolvedValue({
			id: MESSAGE,
			songId: SONG,
			accountId: ACCOUNT,
			userId: USER,
			mentions: [SAM],
		});
		data.updateChatMessage.mockResolvedValue(ROW);
		await call(chat.editMessage, { id: MESSAGE, body: "@Sam @Kim", mentions: [SAM, OTHER] });
		expect(data.updateChatMessage).toHaveBeenCalledWith(MESSAGE, "@Sam @Kim", [SAM, OTHER]);
		await runBackground();
		expect(notifications.notifyMention).toHaveBeenCalledWith(ACCOUNT, "song", SONG, USER, [OTHER]);
	});
	it("an edit naming no one new tells no one", async () => {
		asEditorOf(ACCOUNT);
		data.chatMessageOwnership.mockResolvedValue({
			id: MESSAGE,
			songId: SONG,
			accountId: ACCOUNT,
			userId: USER,
			mentions: [SAM],
		});
		data.updateChatMessage.mockResolvedValue(ROW);
		await call(chat.editMessage, { id: MESSAGE, body: "@Sam", mentions: [SAM] });
		expect(background).not.toHaveBeenCalled();
	});
	it("chatPeople: the chat's audience for someone who reads it, a 404 for a stranger", async () => {
		asViewerOf(ACCOUNT);
		await expect(call(chat.chatPeople, { songId: SONG })).resolves.toEqual([
			{ id: SAM, name: "Sam" },
			{ id: USER, name: "Pat" },
		]);
		asOutsider();
		await expect(call(chat.chatPeople, { songId: SONG })).rejects.toMatchObject(httpError(404));
		asSignedOut();
		await expect(call(chat.chatPeople, { songId: SONG })).rejects.toMatchObject(httpError(401));
	});
});

describe('reactToMessage (docs/chat.md, "Reactions")', () => {
	const input = { id: MESSAGE, emoji: "👍" };
	const REACTED = { ...ROW, reactions: [{ emoji: "👍", count: 1, mine: true, names: ["Pat"] }] };
	beforeEach(() => {
		data.chatMessageOwnership.mockResolvedValue({
			id: MESSAGE,
			songId: SONG,
			accountId: ACCOUNT,
			userId: OTHER_USER,
		});
		data.toggleChatReaction.mockResolvedValue(REACTED);
	});
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(chat.reactToMessage, input)).rejects.toMatchObject(httpError(401));
	});
	it("404 for a stranger to the account, and for a message that does not exist", async () => {
		asOutsider();
		await expect(call(chat.reactToMessage, input)).rejects.toMatchObject(httpError(404));
		expect(data.toggleChatReaction).not.toHaveBeenCalled();
		asEditorOf(ACCOUNT);
		data.chatMessageOwnership.mockResolvedValue(null);
		data.sessionChatMessageOwnership.mockResolvedValue(null);
		await expect(call(chat.reactToMessage, input)).rejects.toMatchObject(httpError(404));
	});
	it("an emoji outside the set is refused by the schema", async () => {
		asEditorOf(ACCOUNT);
		await expect(call(chat.reactToMessage, { id: MESSAGE, emoji: "💩" })).rejects.toBeDefined();
		expect(data.toggleChatReaction).not.toHaveBeenCalled();
	});
	it("a viewer reacts to someone else's message and gets the message back", async () => {
		asViewerOf(ACCOUNT);
		await expect(call(chat.reactToMessage, input)).resolves.toEqual({ message: REACTED });
		expect(data.toggleChatReaction).toHaveBeenCalledWith("song", MESSAGE, USER, "👍");
	});
	it("a session's message is found in its own table and reacted to there", async () => {
		givenRow("recordingSession", { accountId: ACCOUNT });
		data.chatMessageOwnership.mockResolvedValue(null);
		data.sessionChatMessageOwnership.mockResolvedValue({
			id: MESSAGE,
			sessionId: fakeId("session-one"),
			accountId: ACCOUNT,
			userId: OTHER_USER,
		});
		asEditorOf(ACCOUNT);
		await call(chat.reactToMessage, input);
		expect(data.toggleChatReaction).toHaveBeenCalledWith("session", MESSAGE, USER, "👍");
	});
});
