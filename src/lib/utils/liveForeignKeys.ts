import type { FkEdge } from "./fkListDiff";

type Execute = (sql: string) => Promise<{ rows: Record<string, unknown>[] }>;

interface PragmaRow {
	table: string;
	from: string;
	to: string | null;
	on_delete: string | null;
}

const quote = (name: string) => `'${name.replaceAll("'", "''")}'`;

/**
 * The foreign keys the database itself holds, from `pragma_foreign_key_list`
 * over every table (SQLite's, Drizzle's and Turso's internal tables skipped),
 * with `on_delete` lower-cased. A key declared without a column (`to` null)
 * points at the parent's primary key, read from `pragma_table_info`.
 */
export async function liveForeignKeys(
	execute: Execute,
): Promise<(FkEdge & { onDelete: string })[]> {
	const tables = (
		await execute("select name from sqlite_master where type = 'table' order by name")
	).rows
		.map((row) => (row as unknown as { name: string }).name)
		.filter((name) => !/^(sqlite_|__drizzle|__turso)/.test(name));
	const fks: (FkEdge & { onDelete: string })[] = [];
	for (const table of tables) {
		const { rows } = await execute(`select * from pragma_foreign_key_list(${quote(table)})`);
		for (const row of rows as unknown as PragmaRow[]) {
			const parent = row.table;
			fks.push({
				table,
				column: row.from,
				parent,
				parentColumn: row.to ?? (await primaryKeyOf(execute, parent)),
				onDelete: (row.on_delete ?? "no action").toLowerCase(),
			});
		}
	}
	return fks;
}

async function primaryKeyOf(execute: Execute, table: string): Promise<string> {
	const { rows } = await execute(
		`select name from pragma_table_info(${quote(table)}) where pk > 0 order by pk`,
	);
	return rows.length ? (rows[0] as unknown as { name: string }).name : "id";
}
