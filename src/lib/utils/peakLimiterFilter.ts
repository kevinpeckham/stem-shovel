/**
 * The last filter of a leveled session's encode: a limiter at −1 dBFS, so
 * a capture at full scale (or one the leveling gain pushed up) still
 * leaves headroom for a phone's mono downmix. `level=false` keeps the
 * gain as it is; only peaks over the ceiling are caught, with an attack
 * and release fast enough for the peaks the declipper reconstructs.
 */
export function peakLimiterFilter(): string {
	return "alimiter=limit=0.891:level=false:attack=5:release=50";
}
