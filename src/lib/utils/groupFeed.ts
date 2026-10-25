/**
 * The project's chat feed laid out for reading (docs/chat.md, "The
 * project page"): the messages in the order given, with a date line where
 * the day changes. No runs by author, as the song chat has (groupChat):
 * each message names its song, so each carries its own name and time.
 */
export type FeedLine<M extends { id: string; createdAt: number }> =
	| { kind: "date"; id: string; at: number }
	| { kind: "message"; id: string; message: M };

const dayKey = (ms: number) => {
	const d = new Date(ms);
	return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

export function groupFeed<M extends { id: string; createdAt: number }>(
	messages: M[],
): FeedLine<M>[] {
	const lines: FeedLine<M>[] = [];
	let day = "";
	for (const m of messages) {
		const key = dayKey(m.createdAt);
		if (key !== day) {
			day = key;
			lines.push({ kind: "date", id: `date:${m.id}`, at: m.createdAt });
		}
		lines.push({ kind: "message", id: m.id, message: m });
	}
	return lines;
}
