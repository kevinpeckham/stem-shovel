/**
 * Many "stereo" stems are dual mono: a mono source bounced to a stereo file,
 * so L and R are the same signal. Keeping both channels in memory doubles the
 * decoded footprint for nothing, so the engine collapses them after decoding.
 * Real stereo (panning, width, reverb tails that differ) is left alone.
 */

/** Largest per-sample L/R difference still treated as "the same signal". */
const DUAL_MONO_TOLERANCE = 1e-3;

/** True when every sample of `left` and `right` is within `tolerance`. */
function channelsMatch(
	left: Float32Array,
	right: Float32Array,
	tolerance = DUAL_MONO_TOLERANCE,
): boolean {
	if (left.length !== right.length) return false;
	for (let i = 0; i < left.length; i++) {
		if (Math.abs(left[i] - right[i]) > tolerance) return false;
	}
	return true;
}

/**
 * Returns a 1-channel buffer if `buffer` is dual mono, otherwise `buffer`
 * itself. The 2-channel original is dropped by the caller so it can be freed.
 */
export function collapseDualMono(buffer: AudioBuffer, ctx: BaseAudioContext): AudioBuffer {
	if (buffer.numberOfChannels !== 2) return buffer;
	const left = buffer.getChannelData(0);
	if (!channelsMatch(left, buffer.getChannelData(1))) return buffer;
	const mono = ctx.createBuffer(1, buffer.length, buffer.sampleRate);
	mono.copyToChannel(left, 0);
	return mono;
}
