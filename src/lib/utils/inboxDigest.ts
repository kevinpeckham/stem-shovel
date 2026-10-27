/** An inbox item as the digest reads it (`listInbox`'s rows). */
export interface DigestItem {
	kind: string;
	/** How many events of the kind the item bundles on one subject. */
	count: number;
	readAt: Date | null;
	updatedAt: Date;
}

export interface InboxDigest<T extends DigestItem> {
	/** Unread items (not events). */
	unread: number;
	/** Events per kind among the unread, most first; only kinds present. */
	byKind: { kind: string; count: number }[];
	/** The five newest unread items. */
	newest: T[];
}

const NEWEST = 5;

/** Unread events per kind, most first (ties keep the order the kinds first appear). */
function countByKind(items: DigestItem[]): { kind: string; count: number }[] {
	const counts = new Map<string, number>();
	for (const item of items) counts.set(item.kind, (counts.get(item.kind) ?? 0) + item.count);
	return [...counts].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count);
}

/** What the dashboard's "New for you" shows from the inbox: the unread, counted per kind, and the newest of them. */
export function inboxDigest<T extends DigestItem>(items: T[]): InboxDigest<T> {
	const unread = items.filter((i) => !i.readAt);
	return {
		unread: unread.length,
		byKind: countByKind(unread),
		newest: [...unread]
			.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
			.slice(0, NEWEST),
	};
}
