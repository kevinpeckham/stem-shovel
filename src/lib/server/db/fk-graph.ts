/**
 * Every foreign key the Drizzle schema declares, read from the table
 * metadata, so a new table is covered as soon as it declares one. Turso's
 * engine kind does not enforce them (docs/fk-coordinated-response-2026-11-03.md):
 * the list is what scripts/sweep-orphans.ts scans and cross-checks against the
 * live database. Imports only the schema barrel, so scripts can use it
 * (no $app/*).
 */
import { is } from "drizzle-orm";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import * as schema from "./schema";

interface Fk {
	table: string;
	column: string;
	parent: string;
	parentColumn: string;
	onDelete: string;
}

export function allForeignKeys(): Fk[] {
	const fks: Fk[] = [];
	for (const value of Object.values(schema)) {
		if (!is(value, SQLiteTable)) continue;
		const config = getTableConfig(value);
		for (const fk of config.foreignKeys) {
			const ref = fk.reference();
			fks.push({
				table: config.name,
				column: ref.columns[0].name,
				parent: getTableConfig(ref.foreignTable).name,
				parentColumn: ref.foreignColumns[0].name,
				onDelete: fk.onDelete ?? "no action",
			});
		}
	}
	return fks;
}
