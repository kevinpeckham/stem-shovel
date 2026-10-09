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
import { data, givenRow, resetRemoteMocks } from "../../../tests/helpers/fakeServerModules";

/**
 * Authorization of the chat remote functions (docs/chat.md): anyone on the
 * song as a member reads, writes and marks it read, project viewers
 * included; the author edits; the author or an owner / admin deletes.
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
		expect(data.createChatMessage).toHaveBeenCalledWith(ACCOUNT, SONG, USER, "Louder bass");
	});
	it("a project viewer from outside the account writes under the song's account", async () => {
		asOutsider();
		data.projectRoleOf.mockResolvedValue("viewer");
		await expect(call(chat.sendMessage, input)).resolves.toEqual({ message: ROW });
		expect(data.createChatMessage).toHaveBeenCalledWith(ACCOUNT, SONG, OTHER_USER, "Louder bass");
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
		expect(data.updateChatMessage).toHaveBeenCalledWith(MESSAGE, "Softer bass");
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
		expect(data.listChatMessages).toHaveBeenCalledWith(SONG, 5);
	});
});
