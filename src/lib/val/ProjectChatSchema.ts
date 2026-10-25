import * as v from "valibot";
import { NanoIdSchema } from "./NanoIdSchema";

/** A page of the project's chat feed (docs/chat.md, "The project page"): this many by default, never more than the most. */
export const PROJECT_CHAT_FEED_LIMIT = 50;
export const PROJECT_CHAT_FEED_MAX = 100;

/**
 * The project page's read-only chat feed: the project, and `before`, a
 * message's `createdAt` (ms), for the page older than it; without it, the
 * newest page.
 */
export const ProjectChatFeedSchema = v.object({
	projectId: NanoIdSchema,
	before: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
	limit: v.optional(
		v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(PROJECT_CHAT_FEED_MAX)),
		PROJECT_CHAT_FEED_LIMIT,
	),
});

export type ProjectChatFeedInput = v.InferInput<typeof ProjectChatFeedSchema>;
