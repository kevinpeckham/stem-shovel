/**
 * Finds rows whose parent is gone and, with --apply, removes them (or clears
 * the reference where the schema says "set null"). Turso's engine kind does
 * not enforce foreign keys, so the schema's onDelete rules never ran; deletes
 * go through src/lib/server/cascade.ts now, and this sweeps up what earlier
 * ones left. The foreign keys come from the Drizzle schema
 * (src/lib/server/db/fk-graph.ts), cross-checked against the database's own
 * `pragma_foreign_key_list`; a mismatch is reported loudly and the union of
 * both lists is scanned. A key whose action is neither cascade nor set null
 * (no action, restrict, unknown) is reported and never touched ("refuses").
 * Repeats until nothing is left, since removing a parent can orphan the next
 * level down.
 *
 *   bun run db:sweep-orphans            # report only
 *   bun run db:sweep-orphans -- --apply
 *
 * Exits 0 when clean, 2 when orphans or a mismatch were found and not
 * applied, 1 on an error. No import of src/lib/server beyond the schema
 * (the rest pulls in $app/*).
 */
import { createClient } from "@libsql/client";
import { allForeignKeys } from "../src/lib/server/db/fk-graph";
import { fkListDiff, type FkEdge } from "../src/lib/utils/fkListDiff";
import { libsqlUrl } from "../src/lib/utils/libsqlUrl";
import { liveForeignKeys } from "../src/lib/utils/liveForeignKeys";
import { sweepOrphans } from "../src/lib/utils/sweepOrphans";

const apply = process.argv.includes("--apply");
const db = createClient({
	url: libsqlUrl(process.env.TURSO_DATABASE_URL!),
	authToken: process.env.TURSO_AUTH_TOKEN!,
});

const edge = (fk: FkEdge) => `${fk.table}.${fk.column} → ${fk.parent}.${fk.parentColumn}`;

async function crossCheck(): Promise<{
	fks: (FkEdge & { onDelete: string })[];
	mismatch: boolean;
}> {
	const declared = allForeignKeys();
	const live = await liveForeignKeys((sql) => db.execute(sql));
	const { missingLive, missingDeclared } = fkListDiff(declared, live);
	for (const fk of missingLive)
		console.warn(`WARNING: declared in the schema but not in the database: ${edge(fk)}`);
	for (const fk of missingDeclared)
		console.warn(
			`WARNING: in the database but not in the schema: ${edge(fk)} (on delete ${fk.onDelete})`,
		);
	return {
		fks: [...declared, ...missingDeclared],
		mismatch: missingLive.length + missingDeclared.length > 0,
	};
}

async function main(): Promise<number> {
	const { fks, mismatch } = await crossCheck();
	const { pending } = await sweepOrphans({
		execute: (sql) => db.execute(sql),
		fks,
		apply,
		log: (line) => console.log(line),
	});
	return pending || mismatch ? 2 : 0;
}

try {
	process.exitCode = await main();
} catch (error) {
	console.error(error);
	process.exitCode = 1;
}
