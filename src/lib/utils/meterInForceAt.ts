/** A change row as the editor or the song holds it: its time either stored (`start`, `seconds`) or resolved by the caller. */
interface TimedRow {
	kind: string;
	value: string;
	start?: number | null;
	seconds?: number | null;
}

/**
 * The time signature in force at `seconds`: the value of the latest meter row
 * at or before it (a meter row at the same instant wins, since it is in force
 * from then), else null. `timeOf` resolves a row's seconds (the row's `start`,
 * else its `seconds`, by default); a row it cannot place is ignored.
 */
export function meterInForceAt<R extends TimedRow>(
	rows: readonly R[],
	seconds: number,
	timeOf: (row: R) => number | null = (row) => row.start ?? row.seconds ?? null,
): string | null {
	let best: { at: number; value: string } | null = null;
	for (const row of rows) {
		if (row.kind !== "meter") continue;
		const at = timeOf(row);
		if (at === null || !Number.isFinite(at) || at > seconds) continue;
		if (!best || at >= best.at) best = { at, value: row.value.trim() };
	}
	return best?.value ?? null;
}
