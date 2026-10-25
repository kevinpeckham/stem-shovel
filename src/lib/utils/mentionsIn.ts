import { chatTokens } from "./chatTokens";

/**
 * The people a chat message still mentions (docs/chat.md, "Mentions"):
 * those of `people` whose `@Name` is in the body as written, read the way
 * the message will show it (`chatTokens`: longest names first, never run
 * on into a longer word, never inside a link). Each id once, in the order
 * the body names them.
 */
export function mentionsIn(body: string, people: { id: string; name: string }[]): string[] {
	const ids = chatTokens(body, people).flatMap((t) => (t.kind === "mention" ? [t.id] : []));
	return [...new Set(ids)];
}
