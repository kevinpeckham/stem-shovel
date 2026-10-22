import { STEM_TINTS, type StemTint } from "#lib/constants/stemTints.js";

/**
 * The palette tint nearest a color (a DAW's own track color, any RGB),
 * when one is within `within` of it in RGB distance (the default takes
 * a neighbor of about the same hue); else none. The Reaper reader
 * colors tracks with it (utils/rppRead.ts); the DAWproject reader keeps
 * to exact matches, as its colors come from Dawn's own palette.
 */
export function nearestStemTint(
	r: number,
	g: number,
	b: number,
	within = 96,
): StemTint | undefined {
	let best: StemTint | undefined;
	let bestD = within;
	for (const t of STEM_TINTS) {
		const tr = parseInt(t.hex.slice(1, 3), 16);
		const tg = parseInt(t.hex.slice(3, 5), 16);
		const tb = parseInt(t.hex.slice(5, 7), 16);
		const d = Math.hypot(r - tr, g - tg, b - tb);
		if (d <= bestD) {
			bestD = d;
			best = t.id;
		}
	}
	return best;
}
