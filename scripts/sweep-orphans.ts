/**
 * Finds rows whose parent is gone and, with --apply, removes them (or clears
 * the reference where the schema says "set null"). Turso runs with
 * PRAGMA foreign_keys = 0, so the schema's onDelete rules never ran; deletes
 * go through src/lib/server/cascade.ts now, and this sweeps up what earlier
 * ones left. Reads the foreign keys from the Drizzle schema itself, so a new
 * table is covered as soon as it declares one. Repeats until nothing is
 * left, since removing a parent can orphan the next level down.
 *
 *   bun run db:sweep-orphans            # report only
 *   bun run db:sweep-orphans -- --apply
 *
 * No import of src/lib/server (it pulls in $app/*).
 */
import { createClient } from "@libsql/client";
import { is } from "drizzle-orm";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import * as schema from "../src/lib/server/db/schema";
import { libsqlUrl } from "../src/lib/utils/libsqlUrl";

const apply = process.argv.includes("--apply");
const db = createClient({
	url: libsqlUrl(process.env.TURSO_DATABASE_URL!),
	authToken: process.env.TURSO_AUTH_TOKEN!,
});

interface Fk {
	table: string;
	column: string;
	parent: string;
	parentColumn: string;
	onDelete: string;
}
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

let total = 0;
for (let pass = 1; pass <= 6; pass++) {
	let found = 0;
	for (const fk of fks) {
		const where = `"${fk.column}" is not null and "${fk.column}" not in (select "${fk.parentColumn}" from "${fk.parent}")`;
		const [{ n }] = (await db.execute(`select count(*) as n from "${fk.table}" where ${where}`))
			.rows as unknown as { n: number }[];
		if (!n) continue;
		found += Number(n);
		const action = fk.onDelete === "cascade" ? "delete" : "clear";
		console.log(
			`${pass > 1 ? `pass ${pass}: ` : ""}${fk.table}.${fk.column} → ${fk.parent}: ${n} orphaned (${action}${apply ? "" : ", dry run"})`,
		);
		if (!apply) continue;
		if (fk.onDelete === "cascade") await db.execute(`delete from "${fk.table}" where ${where}`);
		else await db.execute(`update "${fk.table}" set "${fk.column}" = null where ${where}`);
	}
	total += found;
	if (!found || !apply) break;
}
console.log(
	total === 0
		? `no orphans across ${fks.length} foreign keys`
		: apply
			? `${total} rows swept`
			: `${total} rows would be swept; rerun with --apply`,
);
