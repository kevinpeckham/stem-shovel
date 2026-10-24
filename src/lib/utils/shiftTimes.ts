const round4 = (x: number) => Math.round(x * 10000) / 10000;

/**
 * Timed items (markers' `t`, automation points' `t`, tempo, meter and key
 * changes' `start`) after a range edit (docs/dawn-daw-plan.md, D4): an
 * item in [from, to) goes, one at or after `to` moves by `by` (never
 * before zero), the rest stays; the list comes back in time order. A
 * range delete passes its range and minus its length (or `to, to` to keep
 * what is inside), an insert `at, at` and the seconds inserted. Pure.
 */
export function shiftTimes<K extends string, T extends Record<K, number>>(
	items: T[],
	key: K,
	from: number,
	to: number,
	by: number,
): T[] {
	return items
		.filter((x) => !(x[key] >= from - 1e-6 && x[key] < to - 1e-6))
		.map((x) =>
			x[key] >= to - 1e-6 ? ({ ...x, [key]: round4(Math.max(0, x[key] + by)) } as T) : x,
		)
		.sort((a, b) => a[key] - b[key]);
}
