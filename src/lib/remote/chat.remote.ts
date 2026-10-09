import { command, form, getRequestEvent, query } from "$app/server";
import { accountOfSong, memberOf, requireUser } from "#lib/server/access.js";
import { background } from "#lib/server/background.js";
import { notifyChat } from "#lib/server/notifications.js";
import {
	chatMessageOwnership,
	createChatMessage,
	deleteChatMessage,
	listChatMessages,
	markChatRead as markRead,
	updateChatMessage,
} from "#lib/server/data.js";
import {
	ChatEditSchema,
	ChatSendSchema,
	ChatSinceSchema,
	ChatSongSchema,
} from "#lib/val/ChatSchema.js";
import { IdSchema } from "#lib/val/SongSchema.js";
import { error } from "@sveltejs/kit";

/**
 * A song's chat (docs/chat.md). Anyone who may see the song as a member
 * (project viewers included) reads and writes; a message is edited by its
 * author and deleted by its author or an owner / admin of the account.
 */

export const sendMessage = form(ChatSendSchema, async ({ songId, body }) => {
	const { locals } = getRequestEvent();
	const user = requireUser(locals);
	const { accountId } = await memberOf(locals, accountOfSong, songId, { viewers: true });
	const message = await createChatMessage(accountId, songId, user.id, body);
	if (!message) error(404, "Song not found");
	background(() => notifyChat(accountId, songId, user.id));
	return { message };
});

export const editMessage = form(ChatEditSchema, async ({ id, body }) => {
	const { locals } = getRequestEvent();
	const user = requireUser(locals);
	const own = await chatMessageOwnership(id);
	if (!own) error(404, "Message not found");
	await memberOf(locals, accountOfSong, own.songId, { viewers: true });
	if (own.userId !== user.id) error(403, "Only the author can edit a message");
	const message = await updateChatMessage(id, body);
	if (!message) error(404, "Message not found");
	return { message };
});

export const deleteMessage = form(IdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const user = requireUser(locals);
	const own = await chatMessageOwnership(id);
	if (!own) error(404, "Message not found");
	await memberOf(locals, accountOfSong, own.songId, { viewers: true });
	const membership = locals.memberships.find((m) => m.accountId === own.accountId);
	const admin = membership?.role === "owner" || membership?.role === "admin";
	if (own.userId !== user.id && !admin)
		error(403, "Only the author or an admin can delete a message");
	await deleteChatMessage(id);
	return { deleted: true };
});

/** The person has seen the chat as it stands: the mark the tab's dot and the "New" line read. */
export const markChatRead = command(ChatSongSchema, async ({ songId }) => {
	const { locals } = getRequestEvent();
	const user = requireUser(locals);
	await memberOf(locals, accountOfSong, songId, { viewers: true });
	return { readAt: await markRead(songId, user.id) };
});

/** The messages made or changed since `after` (ms), for the page's poll; 0 for the whole chat. */
export const chatSince = query(ChatSinceSchema, async ({ songId, after }) => {
	const { locals } = getRequestEvent();
	requireUser(locals);
	await memberOf(locals, accountOfSong, songId, { viewers: true });
	return listChatMessages(songId, after);
});
