import * as v from "valibot";
import { NanoIdSchema } from "./NanoIdSchema";

/** The text of a chat message as typed: trimmed, something in it, not a wall. */
export const CHAT_MESSAGE_MAX = 2000;
const BodySchema = v.pipe(
	v.string(),
	v.trim(),
	v.minLength(1, "Write something."),
	v.maxLength(CHAT_MESSAGE_MAX, `Keep a message under ${CHAT_MESSAGE_MAX} characters.`),
);

/** Where a chat lives (docs/chat.md): a song's, or a session's (a practice or a show). Exactly one id; the remote function checks (`oneChatScope`). */
const scope = {
	songId: v.optional(v.union([NanoIdSchema, v.literal("")]), ""),
	sessionId: v.optional(v.union([NanoIdSchema, v.literal("")]), ""),
};

/** One chat, named by its song or its session. */
export const ChatScopeSchema = v.object(scope);
export type ChatScope = v.InferOutput<typeof ChatScopeSchema>;

/** Whether a scope names one chat and not two or none. */
export const oneChatScope = (o: ChatScope) => !!o.songId !== !!o.sessionId;

/** The most people one message may mention (docs/chat.md, "Mentions"). */
export const CHAT_MENTIONS_MAX = 20;
/** The ids of the people a message mentions, as the composer picked them; the server keeps only those in the chat's audience. */
const MentionsSchema = v.optional(
	v.pipe(v.array(NanoIdSchema), v.maxLength(CHAT_MENTIONS_MAX, "Mention fewer people.")),
	[],
);

/** Form boundary for sending a message to a chat (docs/chat.md). */
export const ChatSendSchema = v.object({ ...scope, body: BodySchema, mentions: MentionsSchema });

/** Form boundary for editing one's own message. */
export const ChatEditSchema = v.object({
	id: NanoIdSchema,
	body: BodySchema,
	mentions: MentionsSchema,
});

/** The messages changed since a moment (ms since the epoch), for the poll; 0 for all of them. */
export const ChatSinceSchema = v.object({
	...scope,
	after: v.optional(v.pipe(v.number(), v.minValue(0)), 0),
});

export type ChatSendInput = v.InferOutput<typeof ChatSendSchema>;

/** The reactions a message can carry (docs/chat.md, "Reactions"): a fixed, small set, one tap each. */
export const CHAT_REACTION_EMOJI = ["👍", "❤️", "😂", "🔥", "🎸", "👀"] as const;
export type ChatReactionEmoji = (typeof CHAT_REACTION_EMOJI)[number];
export const ChatReactionEmojiSchema = v.picklist(CHAT_REACTION_EMOJI);

/** Where a message lives: a song's chat or a session's (the `scope` of `chat_reaction`). */
export type ChatScopeKind = "song" | "session";

/** A tap on a reaction: on if the person had not, off if they had (docs/chat.md, "Reactions"). */
export const ChatReactSchema = v.object({ id: NanoIdSchema, emoji: ChatReactionEmojiSchema });
