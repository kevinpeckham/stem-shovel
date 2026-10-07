/**
 * Open things first (docs/notifications.md, the admin lists): a comparator
 * for rows with a `status`, open before complete before closed, anything
 * else last, leaving the order within a status as the rows came (sort is
 * stable, so a query's newest-first holds). The text column would sort
 * "closed" before "open".
 */
const RANK: Record<string, number> = { open: 0, complete: 1, closed: 2 };

export function byStatus(a: { status: string }, b: { status: string }): number {
	return (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9);
}
