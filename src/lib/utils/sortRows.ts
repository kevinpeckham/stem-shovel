export type SortDir = "asc" | "desc";

type Sortable = string | number | Date | null | undefined;

/** Whether a value is missing: null, undefined or a blank string (sorted last in either direction). */
const missing = (v: Sortable) => v == null || (typeof v === "string" && !v.trim());

/** Compares two present values: strings case-insensitively by locale, Dates by time, numbers by size. */
function compare(a: Sortable, b: Sortable): number {
	if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
	if (typeof a === "number" && typeof b === "number") return a - b;
	return String(a).localeCompare(String(b), undefined, { sensitivity: "base", numeric: true });
}

/**
 * A sorted copy of the rows by one field, ascending or descending: strings
 * case-insensitively (`localeCompare`), Dates by time, numbers by size,
 * missing values (null, undefined, blank) last either way, and rows that
 * tie keep their original order (the sort is stable).
 */
export function sortRows<T, K extends keyof T>(rows: readonly T[], key: K, dir: SortDir): T[] {
	const sign = dir === "asc" ? 1 : -1;
	return rows
		.map((row, i) => ({ row, i }))
		.sort((x, y) => {
			const a = x.row[key] as Sortable;
			const b = y.row[key] as Sortable;
			const ma = missing(a);
			const mb = missing(b);
			if (ma || mb) return ma === mb ? x.i - y.i : ma ? 1 : -1;
			return sign * compare(a, b) || x.i - y.i;
		})
		.map(({ row }) => row);
}
