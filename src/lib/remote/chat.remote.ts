import { command, form, getRequestEvent, query } from "$app/server";
import {
	accountOfRecordingSession,
	accountOfSong,
	memberOf,
	requireUser,
} from "#lib/server/access.js";
import { background } from "#lib/server/background.js";
import { notifyChat, notifySessionChat } from "#lib/server/notifications.js";
import {
	chatMessageOwnership,
	createChatMessage,
	createSessionChatMessage,
	deleteChatMessage,
	deleteSessionChatMessage,
	listChatMessages,
	listSessionChatMessages,
	markChatRead as markRead,
	markSessionChatRead,
	sessionChatMessageOwnership,
	updateChatMessage,
	updateSessionChatMessage,
} from "#lib/server/data.js";
import {
	ChatEditSchema,
	ChatScopeSchema,
	ChatSendSchema,
	ChatSinceSchema,
	oneChatScope,
	type ChatScope,
} from "#lib/val/ChatSchema.js";
import { IdSchema } from "#lib/val/SongSchema.js";
import { error } from "@sveltejs/kit";

/**
 * A chat (docs/chat.md): a song's, or a session's (a practice or a show,
 * docs/uploads-and-blob.md "Sessions"). Anyone who may see the song as a
 * member (project viewers included), or any member of the session's
 * account, reads and writes; a message is edited by its author and
 * deleted by its author or an owner / admin of the account.
 */

/** The chat's account, checked for the signed-in person; the scope's one id. */
async function chatAccess(locals: App.Locals, scope: ChatScope) {
	if (!oneChatScope(scope)) error(400, "A song or a session, one of them");
	return scope.sessionId
		? memberOf(locals, accountOfRecordingSession, scope.sessionId, { viewers: true })
		: memberOf(locals, accountOfSong, scope.songId, { viewers: true });
}

/** A message's chat and author, whichever table it is in; null when there is no such message. */
async function ownerOf(id: string) {
	const song = await chatMessageOwnership(id);
	if (song) return { ...song, scope: { songId: song.songId, sessionId: "" } };
	const session = await sessionChatMessageOwnership(id);
	if (session) return { ...session, scope: { songId: "", sessionId: session.sessionId } };
	return null;
}

export const sendMessage = form(ChatSendSchema, async ({ songId, sessionId, body }) => {
	const { locals } = getRequestEvent();
	const user = requireUser(locals);
	const { accountId } = await chatAccess(locals, { songId, sessionId });
	const message = sessionId
		? await createSessionChatMessage(accountId, sessionId, user.id, body)
		: await createChatMessage(accountId, songId, user.id, body);
	if (!message) error(404, sessionId ? "Session not found" : "Song not found");
	background(() =>
		sessionId
			? notifySessionChat(accountId, sessionId, user.id)
			: notifyChat(accountId, songId, user.id),
	);
	return { message };
});

export const editMessage = form(ChatEditSchema, async ({ id, body }) => {
	const { locals } = getRequestEvent();
	const user = requireUser(locals);
	const own = await ownerOf(id);
	if (!own) error(404, "Message not found");
	await chatAccess(locals, own.scope);
	if (own.userId !== user.id) error(403, "Only the author can edit a message");
	const message = own.scope.sessionId
		? await updateSessionChatMessage(id, body)
		: await updateChatMessage(id, body);
	if (!message) error(404, "Message not found");
	return { message };
});

export const deleteMessage = form(IdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const user = requireUser(locals);
	const own = await ownerOf(id);
	if (!own) error(404, "Message not found");
	await chatAccess(locals, own.scope);
	const membership = locals.memberships.find((m) => m.accountId === own.accountId);
	const admin = membership?.role === "owner" || membership?.role === "admin";
	if (own.userId !== user.id && !admin)
		error(403, "Only the author or an admin can delete a message");
	if (own.scope.sessionId) await deleteSessionChatMessage(id);
	else await deleteChatMessage(id);
	return { deleted: true };
});

/** The person has seen the chat as it stands: the mark the tab's dot and the "New" line read. */
export const markChatRead = command(ChatScopeSchema, async (scope) => {
	const { locals } = getRequestEvent();
	const user = requireUser(locals);
	await chatAccess(locals, scope);
	return {
		readAt: scope.sessionId
			? await markSessionChatRead(scope.sessionId, user.id)
			: await markRead(scope.songId, user.id),
	};
});

/** The messages made or changed since `after` (ms), for the page's poll; 0 for the whole chat. */
export const chatSince = query(ChatSinceSchema, async ({ songId, sessionId, after }) => {
	const { locals } = getRequestEvent();
	requireUser(locals);
	await chatAccess(locals, { songId, sessionId });
	return sessionId ? listSessionChatMessages(sessionId, after) : listChatMessages(songId, after);
});
