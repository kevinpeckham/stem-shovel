import { SPECTRUM_BANDS } from "#lib/constants/autoEq.js";

/** What a silent band (`-inf`) is stored as, dB. */
const SILENT_DB = -100;

/**
 * The octave-band levels of the spectrum pass (src/lib/server/transcode.ts
 * `measureSpectrum`): one `volumedetect` per band prints its RMS level as
 * `[Parsed_volumedetect_<n> @ 0x…] mean_volume: <dB> dB` when the graph
 * closes. ffmpeg prints the bands last to first, so the values are ordered
 * by the filter's index `<n>` (the graph's order, lowest band first), not
 * by where they appear; when an index prints twice the last one counts.
 * Null when fewer than `bands` are found or any is not a number; `-inf` (a
 * silent band) becomes -100.
 */
export function parseOctaveBandLevels(
	stderr: string,
	bands: number = SPECTRUM_BANDS.length,
): number[] | null {
	const byIndex = new Map<number, number>();
	for (const m of stderr.matchAll(
		/\[Parsed_volumedetect_(\d+) @ [^\]]*\]\s*mean_volume:\s*(\S+)\s*dB/g,
	)) {
		const value = m[2] === "-inf" ? SILENT_DB : Number(m[2]);
		byIndex.set(Number(m[1]), value);
	}
	if (byIndex.size < bands) return null;
	const levels = [...byIndex.entries()]
		.sort(([a], [b]) => a - b)
		.slice(0, bands)
		.map(([, v]) => v);
	return levels.every(Number.isFinite) ? levels : null;
}
