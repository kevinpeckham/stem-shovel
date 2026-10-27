/** The first `shown` items of a list, how many that is of the total, and whether more remain. */
export function pageOf<T>(items: T[], shown: number) {
	const visible = items.slice(0, Math.max(0, shown));
	return {
		visible,
		count: visible.length,
		total: items.length,
		more: visible.length < items.length,
	};
}
