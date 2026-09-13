/** "12|3" or "12|3|0.5" — bar, beat and a fraction of the beat; null if not bars. */
export function parseBarsText(
	text: string,
): { bar: number; beat: number; fraction: number } | null {
	const m = text.trim().match(/^(-?\d+)\|(\d+)(?:\|(\d*\.?\d+))?$/);
	if (!m) return null;
	const [, bar, beat, fraction = "0"] = m;
	if (Number(beat) < 1 || Number(fraction) >= 1) return null;
	return { bar: Number(bar), beat: Number(beat), fraction: Number(fraction) };
}
