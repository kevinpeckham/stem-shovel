import { getRequestEvent, query } from "$app/server";
import { accountOfProject, memberOf } from "#lib/server/access.js";
import { projectChatFeed as feedOf } from "#lib/server/projectChat.js";
import { ProjectChatFeedSchema } from "#lib/val/ProjectChatSchema.js";

/**
 * The project page's chat feed (docs/chat.md, "The project page"): every
 * song's messages in one read-only stream, for whoever may read the songs'
 * chats: a member of the account (on a restricted project, one added to
 * it) or one of the project's people, viewers included. 401 signed out,
 * 404 otherwise, as memberOf answers.
 */
export const projectChatFeed = query(
	ProjectChatFeedSchema,
	async ({ projectId, before, limit }) => {
		const { locals } = getRequestEvent();
		const { accountId } = await memberOf(locals, accountOfProject, projectId, { viewers: true });
		return feedOf(accountId, projectId, { before, limit });
	},
);
