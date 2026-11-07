/** The middle of `values` (the mean of the two middle ones for an even count); NaN for none. */
export function median(values: number[]): number {
	if (values.length === 0) return Number.NaN;
	const sorted = values.toSorted((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
