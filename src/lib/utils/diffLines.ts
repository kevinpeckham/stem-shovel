/** One line of a line diff: kept, or only in the after text, or only in the before. */
export interface DiffLine {
	kind: "same" | "added" | "removed";
	text: string;
}

/** Past this many lines a side the O(n·m) table is not built. */
const MAX_LINES = 2000;

/** The lines of a text, a trailing newline closing the last line rather than opening an empty one. */
function linesOf(text: string): string[] {
	if (text === "") return [];
	const lines = text.split(/\r?\n/);
	if (lines.at(-1) === "") lines.pop();
	return lines;
}

/**
 * What changed from `before` to `after`, line by line (the document history's
 * Changes view; DocHistoryPanel): a longest-common-subsequence diff, so a
 * changed line reads as the old one removed and the new one added, with
 * removals listed before the additions that replace them. `"a\n"` and `"a"`
 * are the same text. Beyond 2000 lines a side the table would be too large,
 * so everything before is removed and everything after added.
 */
export function diffLines(before: string, after: string): DiffLine[] {
	const a = linesOf(before);
	const b = linesOf(after);
	if (a.length > MAX_LINES || b.length > MAX_LINES)
		return [
			...a.map((text): DiffLine => ({ kind: "removed", text })),
			...b.map((text): DiffLine => ({ kind: "added", text })),
		];
	const n = a.length;
	const m = b.length;
	// lcs[i][j]: the longest common subsequence of a[i..] and b[j..].
	const lcs = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
	for (let i = n - 1; i >= 0; i--)
		for (let j = m - 1; j >= 0; j--)
			lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
	const out: DiffLine[] = [];
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (a[i] === b[j]) {
			out.push({ kind: "same", text: a[i] });
			i++;
			j++;
		} else if (lcs[i + 1][j] >= lcs[i][j + 1]) out.push({ kind: "removed", text: a[i++] });
		else out.push({ kind: "added", text: b[j++] });
	}
	while (i < n) out.push({ kind: "removed", text: a[i++] });
	while (j < m) out.push({ kind: "added", text: b[j++] });
	return out;
}
