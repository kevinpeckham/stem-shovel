import type { DiffLine } from "./diffLines";

/** A diff line to show, or a run of unchanged lines folded into a count. */
export type DiffRow = DiffLine | { kind: "skip"; count: number };

/**
 * A line diff trimmed to its changes (DocHistoryPanel's Changes view): each
 * change keeps `context` unchanged lines either side, and every longer run of
 * unchanged lines in between becomes one `skip` row with its count. A run of
 * a single line is shown rather than folded, since the row would take as much
 * room. A diff with no change folds to one skip row (or none when empty).
 */
export function collapseDiffContext(lines: DiffLine[], context = 2): DiffRow[] {
	const keep = lines.map(() => false);
	lines.forEach((l, i) => {
		if (l.kind === "same") return;
		for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++)
			keep[k] = true;
	});
	const out: DiffRow[] = [];
	let i = 0;
	while (i < lines.length) {
		if (keep[i]) {
			out.push(lines[i++]);
			continue;
		}
		let j = i;
		while (j < lines.length && !keep[j]) j++;
		if (j - i === 1) out.push(lines[i]);
		else out.push({ kind: "skip", count: j - i });
		i = j;
	}
	return out;
}
