import type { FkEdge } from "./fkListDiff";

type Execute = (sql: string) => Promise<{ rows: Record<string, unknown>[] }>;
type ScanFk = FkEdge & { onDelete: string };
type Action = "delete" | "clear" | "refuses";

interface Sweep {
	execute: Execute;
	fks: ScanFk[];
	apply: boolean;
	log: (line: string) => void;
}

const edge = (fk: FkEdge) => `${fk.table}.${fk.column} → ${fk.parent}.${fk.parentColumn}`;

/** cascade deletes, set null clears; no action, restrict and anything else refuse. */
const actionOf = (onDelete: string): Action =>
	onDelete === "cascade" ? "delete" : onDelete === "set null" ? "clear" : "refuses";

const whereOrphaned = (fk: FkEdge) =>
	`"${fk.column}" is not null and "${fk.column}" not in (select "${fk.parentColumn}" from "${fk.parent}")`;

async function countOrphans(execute: Execute, fk: FkEdge): Promise<number> {
	const { rows } = await execute(
		`select count(*) as n from "${fk.table}" where ${whereOrphaned(fk)}`,
	);
	return Number((rows[0] as { n: number }).n);
}

function remove(execute: Execute, fk: FkEdge, action: Action) {
	return action === "delete"
		? execute(`delete from "${fk.table}" where ${whereOrphaned(fk)}`)
		: execute(`update "${fk.table}" set "${fk.column}" = null where ${whereOrphaned(fk)}`);
}

/** One key on one pass; returns the rows found when the key may act on them. */
async function scanKey(
	{ execute, apply, log }: Sweep,
	fk: ScanFk,
	pass: number,
	refused: Map<string, number>,
): Promise<number> {
	const n = await countOrphans(execute, fk);
	const action = actionOf(fk.onDelete);
	if (!n || (action === "refuses" && refused.get(edge(fk)) === n)) return 0;
	const dry = apply && action !== "refuses" ? "" : ", dry run";
	log(
		`${pass > 1 ? `pass ${pass}: ` : ""}${fk.table}.${fk.column} → ${fk.parent}: ${n} orphaned (${action}${dry})`,
	);
	if (action === "refuses") {
		refused.set(edge(fk), n);
		return 0;
	}
	if (apply) await remove(execute, fk, action);
	return n;
}

function summary(apply: boolean, total: number, refusedRows: number, keys: number): string {
	if (total === 0 && !refusedRows) return `no orphans across ${keys} foreign keys`;
	if (apply) return `${total} rows swept`;
	return `${total} rows would be swept; rerun with --apply`;
}

/**
 * Finds rows whose parent is gone under each key and, with `apply`, deletes
 * them (cascade) or clears the reference (set null); a key with any other
 * action is reported and left alone ("refuses"). Repeats while it removes
 * something, up to six passes, since a delete can orphan the next level down.
 * Logs the same lines scripts/sweep-orphans.ts always printed; `pending` is
 * true when orphans were found and not removed.
 */
export async function sweepOrphans(
	sweep: Sweep,
): Promise<{ total: number; refusedRows: number; pending: boolean }> {
	const refused = new Map<string, number>();
	let total = 0;
	for (let pass = 1; pass <= 6; pass++) {
		let found = 0;
		for (const fk of sweep.fks) found += await scanKey(sweep, fk, pass, refused);
		total += found;
		if (!found || !sweep.apply) break;
	}
	const refusedRows = [...refused.values()].reduce((sum, n) => sum + n, 0);
	sweep.log(summary(sweep.apply, total, refusedRows, sweep.fks.length));
	if (refusedRows)
		sweep.log(`${refusedRows} orphaned rows under keys without cascade or set null; left in place`);
	return { total, refusedRows, pending: (total > 0 && !sweep.apply) || refusedRows > 0 };
}
