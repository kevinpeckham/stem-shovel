import { reorderById } from "./reorderById";

/**
 * The rows whose sort order changes when they are put in the order `ids`
 * lists, each with its new position; null unless `ids` names every row
 * exactly once (a stale or partial list from the client changes nothing).
 */
export function sortOrderMoves(
	rows: readonly { id: string; sortOrder: number }[],
	ids: readonly string[],
): { id: string; sortOrder: number }[] | null {
	const named = new Set(ids);
	if (named.size !== ids.length || ids.length !== rows.length) return null;
	if (!rows.every((r) => named.has(r.id))) return null;
	return reorderById(rows, ids).flatMap((row, i) =>
		row.sortOrder === i ? [] : [{ id: row.id, sortOrder: i }],
	);
}
