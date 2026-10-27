import { command, form, getRequestEvent, query } from "$app/server";
import {
	accountOfRecordingSession,
	accountOfSong,
	memberOf,
	requireUser,
} from "#lib/server/access.js";
import { background } from "#lib/server/background.js";
import {
	markSubjectRead,
	notifyChat,
	notifyMention,
	notifySessionChat,
} from "#lib/server/notifications.js";
import {
	chatAudience,
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
	toggleChatReaction,
	updateChatMessage,
	updateSessionChatMessage,
} from "#lib/server/data.js";
import {
	ChatEditSchema,
	ChatReactSchema,
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
 * deleted by its author or an owner / admin of the account. Anyone who
 * reads a chat reacts in it and may be mentioned in it ("Mentions",
 * "Reactions").
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

/** The signed-in person and a message they may read, whichever chat holds it: a 404 when there is none or it is not theirs to see. */
async function readableMessage(id: string) {
	const { locals } = getRequestEvent();
	const user = requireUser(locals);
	const own = await ownerOf(id);
	if (!own) error(404, "Message not found");
	await chatAccess(locals, own.scope);
	return { locals, user, own };
}

/** A scope as the data layer and the notifications name it: the kind of chat and its song's or session's id. */
const placeOf = (scope: ChatScope) =>
	scope.sessionId
		? { kind: "session" as const, id: scope.sessionId }
		: { kind: "song" as const, id: scope.songId };

/** Of the ids the composer picked, those of people in the chat's audience, each once: nobody outside the chat is named or told. */
async function mentionable(accountId: string, scope: ChatScope, picked: string[]) {
	if (picked.length === 0) return [];
	const audience = new Set((await chatAudience(accountId, scope)).map((p) => p.id));
	return [...new Set(picked)].filter((id) => audience.has(id));
}

export const sendMessage = form(ChatSendSchema, async ({ songId, sessionId, body, mentions }) => {
	const { locals } = getRequestEvent();
	const user = requireUser(locals);
	const { accountId } = await chatAccess(locals, { songId, sessionId });
	const named = await mentionable(accountId, { songId, sessionId }, mentions);
	const message = sessionId
		? await createSessionChatMessage(accountId, sessionId, user.id, body, named)
		: await createChatMessage(accountId, songId, user.id, body, named);
	if (!message) error(404, sessionId ? "Session not found" : "Song not found");
	const place = placeOf({ songId, sessionId });
	background(async () => {
		// The people named hear of it as a mention, and the chat's folded item skips them.
		await (sessionId
			? notifySessionChat(accountId, sessionId, user.id, named)
			: notifyChat(accountId, songId, user.id, named));
		await notifyMention(accountId, place.kind, place.id, user.id, named);
	});
	return { message };
});

export const editMessage = form(ChatEditSchema, async ({ id, body, mentions }) => {
	const { user, own } = await readableMessage(id);
	if (own.userId !== user.id) error(403, "Only the author can edit a message");
	const named = await mentionable(own.accountId, own.scope, mentions);
	const message = own.scope.sessionId
		? await updateSessionChatMessage(id, body, named)
		: await updateChatMessage(id, body, named);
	if (!message) error(404, "Message not found");
	// Only the people the edit newly names are told; those named before were told then.
	const added = named.filter((u) => !(own.mentions ?? []).includes(u));
	const place = placeOf(own.scope);
	if (added.length > 0)
		background(() => notifyMention(own.accountId, place.kind, place.id, user.id, added));
	return { message };
});

export const deleteMessage = form(IdSchema, async ({ id }) => {
	const { locals, user, own } = await readableMessage(id);
	const membership = locals.memberships.find((m) => m.accountId === own.accountId);
	const admin = membership?.role === "owner" || membership?.role === "admin";
	if (own.userId !== user.id && !admin)
		error(403, "Only the author or an admin can delete a message");
	if (own.scope.sessionId) await deleteSessionChatMessage(id);
	else await deleteChatMessage(id);
	return { deleted: true };
});

/** The person has seen the chat as it stands: the mark the tab's dot and the "New" line read, and the chat's own notifications (new messages, mentions in it) read with it. */
export const markChatRead = command(ChatScopeSchema, async (scope) => {
	const { locals } = getRequestEvent();
	const user = requireUser(locals);
	await chatAccess(locals, scope);
	const [readAt] = await Promise.all([
		scope.sessionId
			? markSessionChatRead(scope.sessionId, user.id)
			: markRead(scope.songId, user.id),
		markSubjectRead(
			user.id,
			["chat", "mention"],
			scope.sessionId ? `session:${scope.sessionId}` : scope.songId,
		),
	]);
	return { readAt };
});

/** A tap on a reaction (docs/chat.md, "Reactions"): on or off for the signed-in person, for anyone who reads the chat; the message comes back as they now see it. */
export const reactToMessage = command(ChatReactSchema, async ({ id, emoji }) => {
	const { user, own } = await readableMessage(id);
	const message = await toggleChatReaction(placeOf(own.scope).kind, id, user.id, emoji);
	if (!message) error(404, "Message not found");
	return { message };
});

/** The people the composer's `@` picker offers (docs/chat.md, "Mentions"): the chat's audience by name. */
export const chatPeople = query(ChatScopeSchema, async (scope) => {
	const { locals } = getRequestEvent();
	requireUser(locals);
	const { accountId } = await chatAccess(locals, scope);
	return chatAudience(accountId, scope);
});

/** The messages made or changed since `after` (ms), for the page's poll; 0 for the whole chat. */
export const chatSince = query(ChatSinceSchema, async ({ songId, sessionId, after }) => {
	const { locals } = getRequestEvent();
	const user = requireUser(locals);
	await chatAccess(locals, { songId, sessionId });
	return sessionId
		? listSessionChatMessages(sessionId, after, user.id)
		: listChatMessages(songId, after, user.id);
});
