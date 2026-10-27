import { nextSort } from "#lib/utils/nextSort.js";
import { sortRows, type SortDir } from "#lib/utils/sortRows.js";

/**
 * A sortable table's sort (Your Songs, Sessions, Projects): the column and
 * direction, the direction a header shows, a header click (`nextSort`) and
 * the rows in that order (`sortRows`). The columns in `descFirst` start
 * descending (dates, counts), the starting column among them.
 */
export class TableSort<K extends string> {
	key: K;
	dir: SortDir;
	readonly #descFirst: readonly K[];

	constructor(key: K, descFirst: readonly K[] = []) {
		this.#descFirst = descFirst;
		this.key = $state(key);
		this.dir = $state(descFirst.includes(key) ? "desc" : "asc");
	}

	/** The direction to show on a column's header: its own when it is the sorted column, else none. */
	dirOf = (key: K): SortDir | null => (this.key === key ? this.dir : null);

	/** A click on a column's header: flips the sorted column, or starts another in its first direction. */
	sortBy = (key: K) => {
		const next = nextSort({ key: this.key, dir: this.dir }, key, this.#descFirst);
		this.key = next.key;
		this.dir = next.dir;
	};

	/** A sorted copy of the rows in the current order. */
	apply = <T extends Record<K, unknown>>(rows: readonly T[]): T[] =>
		sortRows(rows, this.key, this.dir);
}
