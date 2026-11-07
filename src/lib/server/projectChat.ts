import { chatAttachmentsOf, type ChatAttachmentRow } from "#lib/server/data.js";
import { db, schema } from "#lib/server/db/index.js";
import { PROJECT_CHAT_FEED_LIMIT, PROJECT_CHAT_FEED_MAX } from "#lib/val/ProjectChatSchema.js";
import { and, desc, eq, inArray, lt } from "drizzle-orm";

const { chatMessage, song } = schema;

/** One message in the project's feed (docs/chat.md, "The project page"): a song chat's message with its song beside it, times as ms. */
export interface ProjectChatFeedRow {
	id: string;
	songId: string;
	songTitle: string;
	songSlug: string;
	userId: string;
	authorName: string;
	body: string;
	createdAt: number;
	editedAt: number | null;
	/** The files it carries, oldest first (docs/chat.md, "Attachments"); none is []. */
	attachments: ChatAttachmentRow[];
}

/**
 * Every song's chat in a project as one feed, newest first: a page of
 * `limit` (50, at most 100), older than `before` (a `createdAt`, ms) when
 * given, and whether there is more past it. Scoped by the account first:
 * a project of another account has no songs here, so no messages.
 */
export async function projectChatFeed(
	accountId: string,
	projectId: string,
	{ before, limit = PROJECT_CHAT_FEED_LIMIT }: { before?: number; limit?: number } = {},
): Promise<{ messages: ProjectChatFeedRow[]; more: boolean }> {
	const take = Math.min(Math.max(1, Math.floor(limit)), PROJECT_CHAT_FEED_MAX);
	const songs = await db.query.song.findMany({
		where: and(eq(song.accountId, accountId), eq(song.projectId, projectId)),
		columns: { id: true, title: true, slug: true },
	});
	if (songs.length === 0) return { messages: [], more: false };
	const bySong = new Map(songs.map((s) => [s.id, s]));
	const rows = await db.query.chatMessage.findMany({
		where: and(
			eq(chatMessage.accountId, accountId),
			inArray(
				chatMessage.songId,
				songs.map((s) => s.id),
			),
			before ? lt(chatMessage.createdAt, new Date(before)) : undefined,
		),
		orderBy: [desc(chatMessage.createdAt), desc(chatMessage.id)],
		limit: take + 1,
		with: { author: { columns: { id: true, name: true } } },
	});
	const page = rows.slice(0, take);
	const files = await chatAttachmentsOf(page.map((m) => m.id));
	const messages = page.map((m) => {
		const s = bySong.get(m.songId);
		return {
			id: m.id,
			songId: m.songId,
			songTitle: s?.title ?? "",
			songSlug: s?.slug ?? "",
			userId: m.userId,
			authorName: m.author.name,
			body: m.body,
			createdAt: m.createdAt.getTime(),
			editedAt: m.editedAt?.getTime() ?? null,
			attachments: files.get(m.id) ?? [],
		};
	});
	return { messages, more: rows.length > take };
}
