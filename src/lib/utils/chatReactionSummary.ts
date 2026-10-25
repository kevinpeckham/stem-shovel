import { CHAT_REACTION_EMOJI, type ChatReactionEmoji } from "#lib/val/ChatSchema.js";

/** One emoji's reactions on a chat message as the page shows them (docs/chat.md, "Reactions"). */
export interface ChatReactionSummary {
	emoji: ChatReactionEmoji;
	count: number;
	/** Whether the viewer is one of them, so the chip is lit and a tap takes it back. */
	mine: boolean;
	/** Who reacted, for the chip's title, in the order they did. */
	names: string[];
}

/**
 * A message's reactions folded per emoji, in the fixed set's order
 * (`CHAT_REACTION_EMOJI`), only the emoji someone chose; `mine` needs the
 * viewer's id and is false without one.
 */
export function chatReactionSummary(
	reactions: { emoji: ChatReactionEmoji; userId: string; user: { name: string } | null }[],
	viewerId?: string | null,
): ChatReactionSummary[] {
	return CHAT_REACTION_EMOJI.flatMap((emoji) => {
		const these = reactions.filter((r) => r.emoji === emoji);
		if (these.length === 0) return [];
		return [
			{
				emoji,
				count: these.length,
				mine: !!viewerId && these.some((r) => r.userId === viewerId),
				names: these.map((r) => r.user?.name ?? "Someone"),
			},
		];
	});
}
