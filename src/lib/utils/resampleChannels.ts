/**
 * Channel data read at another speed (docs/dawn-daw-plan.md, D5): `factor`
 * 2 plays it twice as fast (half as long, an octave up), by linear
 * interpolation. With a stretch back to the original length
 * (utils/stretchChannels.ts) this is a pitch shift. Pure.
 */
export function resampleChannels(channels: Float32Array[], factor: number): Float32Array[] {
	if (!(factor > 0)) return channels.map((c) => c.slice());
	return channels.map((src) => {
		const n = src.length;
		const outLength = Math.max(1, Math.round(n / factor));
		const out = new Float32Array(outLength);
		for (let i = 0; i < outLength; i++) {
			const pos = i * factor;
			const j = Math.floor(pos);
			const frac = pos - j;
			const a = j < n ? src[j]! : 0;
			const b = j + 1 < n ? src[j + 1]! : 0;
			out[i] = a + (b - a) * frac;
		}
		return out;
	});
}

/** Semitones as a playback factor: twelve up is twice the speed. */
export const semitonesFactor = (semitones: number) => 2 ** (semitones / 12);
