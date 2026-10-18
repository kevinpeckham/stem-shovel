import { LOUDNESS_TARGET_LUFS, TRUE_PEAK_CEILING_DBTP } from "#lib/constants/loudness.js";
import type { LoudnessReading } from "./measureLoudness";

/**
 * The one gain that brings a measured bounce to the target loudness
 * without its true peak passing the ceiling (ffmpeg's loudnorm in its
 * linear mode): whichever of the two is the smaller lift, as a linear
 * factor. Silence (nothing measured) is left alone.
 */
export function normalizationGain(
	reading: Pick<LoudnessReading, "integrated" | "truePeak">,
	target = { lufs: LOUDNESS_TARGET_LUFS, ceilingDbtp: TRUE_PEAK_CEILING_DBTP },
): number {
	if (reading.integrated === null || !Number.isFinite(reading.integrated)) return 1;
	const forLoudness = target.lufs - reading.integrated;
	const forPeak = Number.isFinite(reading.truePeak)
		? target.ceilingDbtp - reading.truePeak
		: forLoudness;
	return 10 ** (Math.min(forLoudness, forPeak) / 20);
}
