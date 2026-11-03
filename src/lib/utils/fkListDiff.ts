export interface FkEdge {
	table: string;
	column: string;
	parent: string;
	parentColumn: string;
}

const keyOf = (fk: FkEdge) => [fk.table, fk.column, fk.parent, fk.parentColumn].join("\u0000");

/**
 * The foreign keys one list has and the other lacks, compared on table,
 * column, parent and parent column (order-insensitive): the schema's
 * declared list against the database's live `pragma_foreign_key_list`.
 */
export function fkListDiff<D extends FkEdge, L extends FkEdge>(
	declared: D[],
	live: L[],
): { missingLive: D[]; missingDeclared: L[] } {
	const liveKeys = new Set(live.map(keyOf));
	const declaredKeys = new Set(declared.map(keyOf));
	return {
		missingLive: declared.filter((fk) => !liveKeys.has(keyOf(fk))),
		missingDeclared: live.filter((fk) => !declaredKeys.has(keyOf(fk))),
	};
}
