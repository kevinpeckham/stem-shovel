/**
 * A three-way merge of text by lines, as diff3 does it (docs/user-docs.md,
 * "Merging the seed into an edited page"): `base` is the common ancestor,
 * `ours` and `theirs` the two descendants. Lines of the base that survive
 * in both (by a longest-common-subsequence match on each side) are the
 * anchors; between two anchors each side either kept the base's lines or
 * changed them, and a region changed on one side only takes that side,
 * one changed the same way on both takes it once, and one changed
 * differently on both is a conflict: written with markers and reported,
 * or, with `prefer`, taken from that side and reported (the user docs:
 * the page as edited in the app always wins, and the run says what the
 * seed wanted there). Lines are compared with trailing whitespace and
 * non-breaking spaces ignored, since an editor adds those on its own; the
 * text that comes out is each side's as written.
 */
export interface MergeConflict {
	base: string[];
	ours: string[];
	theirs: string[];
	/** The side taken, when `prefer` settled it. */
	taken?: "ours" | "theirs";
}
export interface MergeResult {
	/** The merged text; with conflicts, `<<<<<<<` / `=======` / `>>>>>>>` blocks mark them. */
	text: string;
	conflicts: MergeConflict[];
	/** In the regions taken from `theirs` alone (the change being merged in): lines new to the region and lines of the base that went, for a summary. */
	added: number;
	removed: number;
}

/** Longest common subsequence of two line arrays as a map from an index in `a` to its match in `b`. */
export function lcsMatch(a: string[], b: string[]): Map<number, number> {
	const n = a.length;
	const m = b.length;
	// dp[i][j]: the LCS length of a[i..] and b[j..].
	const dp: Uint32Array[] = [];
	for (let i = 0; i <= n; i++) dp.push(new Uint32Array(m + 1));
	for (let i = n - 1; i >= 0; i--)
		for (let j = m - 1; j >= 0; j--)
			dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
	const match = new Map<number, number>();
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (a[i] === b[j]) {
			match.set(i, j);
			i++;
			j++;
		} else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++;
		else j++;
	}
	return match;
}

const same = (x: string[], y: string[]) => x.length === y.length && x.every((l, i) => l === y[i]);
/** A line as compared: trailing whitespace gone, a non-breaking space a space. */
const key = (l: string) => l.replace(/\u00a0/g, " ").replace(/\s+$/, "");

export interface MergeOptions {
	ours?: string;
	theirs?: string;
	/** A region changed differently on both sides takes this side instead of markers; still reported. */
	prefer?: "ours" | "theirs";
}

export function mergeThreeWay(
	base: string,
	ours: string,
	theirs: string,
	options: MergeOptions = {},
): MergeResult {
	const labels = { ours: options.ours ?? "ours", theirs: options.theirs ?? "theirs" };
	const o = base.split("\n");
	const a = ours.split("\n");
	const b = theirs.split("\n");
	const ok = o.map(key);
	const ak = a.map(key);
	const bk = b.map(key);
	const ma = lcsMatch(ok, ak);
	const mb = lcsMatch(ok, bk);
	const out: string[] = [];
	const conflicts: MergeConflict[] = [];
	let added = 0;
	let removed = 0;
	// Anchors: base lines matched on both sides. The regions between them (and before the first, after the last) are merged one by one.
	const anchors = [...ma.keys()].filter((i) => mb.has(i));
	let oFrom = 0;
	let aFrom = 0;
	let bFrom = 0;
	const region = (oTo: number, aTo: number, bTo: number) => {
		const os = o.slice(oFrom, oTo);
		const as = a.slice(aFrom, aTo);
		const bs = b.slice(bFrom, bTo);
		const osk = ok.slice(oFrom, oTo);
		const ask = ak.slice(aFrom, aTo);
		const bsk = bk.slice(bFrom, bTo);
		if (same(ask, osk) && same(bsk, osk)) out.push(...as);
		else if (same(ask, osk)) {
			out.push(...bs);
			added += bsk.filter((l) => !osk.includes(l)).length;
			removed += osk.filter((l) => !bsk.includes(l)).length;
		} else if (same(bsk, osk) || same(ask, bsk)) out.push(...as);
		else if (options.prefer) {
			conflicts.push({ base: os, ours: as, theirs: bs, taken: options.prefer });
			out.push(...(options.prefer === "ours" ? as : bs));
		} else {
			conflicts.push({ base: os, ours: as, theirs: bs });
			out.push(`<<<<<<< ${labels.ours}`, ...as, "=======", ...bs, `>>>>>>> ${labels.theirs}`);
		}
	};
	for (const i of anchors) {
		region(i, ma.get(i)!, mb.get(i)!);
		// The anchor as the page has it (the same line but for trailing whitespace).
		out.push(a[ma.get(i)!]!);
		oFrom = i + 1;
		aFrom = ma.get(i)! + 1;
		bFrom = mb.get(i)! + 1;
	}
	region(o.length, a.length, b.length);
	return { text: out.join("\n"), conflicts, added, removed };
}
