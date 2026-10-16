/**
 * A track's loudness from the peaks the player already has
 * (docs/visual-mixer.md, "what y means"): the mean of the waveform's bins
 * above a silence floor, as dB. A stand-in until a stem carries measured
 * loudness; it ranks a hot recording above a quiet one well enough to
 * place a puck. Null when the peaks are missing or all silent.
 */
const SILENCE = 10 ** (-60 / 20);

export function loudnessFromPeaks(peaks: readonly number[] | undefined | null): number | null {
	if (!peaks || peaks.length === 0) return null;
	let sum = 0;
	let n = 0;
	for (const p of peaks)
		if (p > SILENCE) {
			sum += p;
			n++;
		}
	if (n === 0) return null;
	return 20 * Math.log10(sum / n);
}

/**
 * Each track's loudness relative to the loudest (0 for it, negative for the
 * rest); a track without a figure counts as the loudest, so it sits where
 * its fader says.
 */
export function relativeLoudness(
	absolute: ReadonlyMap<string, number | null>,
): Map<string, number> {
	let max = -Infinity;
	for (const v of absolute.values()) if (v !== null && v > max) max = v;
	const out = new Map<string, number>();
	for (const [id, v] of absolute) out.set(id, v === null || max === -Infinity ? 0 : v - max);
	return out;
}
