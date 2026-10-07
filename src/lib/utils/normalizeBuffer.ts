/**
 * A quiet take up to −1 dBFS in place (not a near-silent one, and never
 * down), as the looper and the Idea Recorder do with "Normalize" on.
 * Returns the factor applied (1 when nothing was).
 */
export function normalizeBuffer(buffer: AudioBuffer, target = 0.891): number {
	let peak = 0;
	for (let c = 0; c < buffer.numberOfChannels; c++) {
		const x = buffer.getChannelData(c);
		for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
	}
	if (peak <= 0.01 || peak >= target) return 1;
	const k = target / peak;
	for (let c = 0; c < buffer.numberOfChannels; c++) {
		const x = buffer.getChannelData(c);
		for (let i = 0; i < x.length; i++) x[i] *= k;
	}
	return k;
}
