import { LEVEL_MAX_LIMIT_DB, SESSION_LOUDNESS } from "#lib/constants/sessionLoudness.js";

/**
 * The one gain (dB, to 0.1) that brings a measured set to the integrated
 * target, held back so that no more than `maxLimitDb` of its loudest true
 * peak goes over the ceiling into the limiter. Negative for a set louder
 * than the target.
 */
export function levelingGainDb(
	m: { integrated: number; truePeak: number },
	target: { integrated: number; truePeak: number } = SESSION_LOUDNESS,
	maxLimitDb = LEVEL_MAX_LIMIT_DB,
): number {
	const gain = Math.min(
		target.integrated - m.integrated,
		target.truePeak - m.truePeak + maxLimitDb,
	);
	return Math.round(gain * 10) / 10;
}
