/**
 * Reduce an AudioBuffer to `bins` peak values (max absolute sample per bin,
 * across all channels). The result is what the waveform canvas draws and,
 * later, what gets stored in Turso so reviewers never have to decode audio
 * just to see a waveform.
 */
/** Number of waveform bins per stem; also what gets stored in the database. */
export const PEAK_BINS = 1024;

export function computePeaks(buffer: AudioBuffer, bins = PEAK_BINS): Float32Array {
	const peaks = new Float32Array(bins);
	const length = buffer.length;
	const samplesPerBin = length / bins;

	for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
		const data = buffer.getChannelData(channel);
		for (let bin = 0; bin < bins; bin++) {
			const start = Math.floor(bin * samplesPerBin);
			const end = Math.min(length, Math.floor((bin + 1) * samplesPerBin));
			let max = 0;
			for (let i = start; i < end; i++) {
				const v = Math.abs(data[i]);
				if (v > max) max = v;
			}
			// Keep the loudest channel per bin so a hard-panned stem still shows up
			if (max > peaks[bin]) peaks[bin] = max;
		}
	}
	return peaks;
}

/**
 * Peaks of the sum of several buffers — the waveform of the mix as it would
 * play, rather than the sum of each stem's peaks (which overstates where
 * stems cancel). Channels are averaged per stem, bins span the longest
 * buffer, and the result is normalised so the loudest bin is 1.
 */
export function computeMixPeaks(buffers: AudioBuffer[], bins = PEAK_BINS): Float32Array {
	const peaks = new Float32Array(bins);
	const length = buffers.reduce((max, b) => Math.max(max, b.length), 0);
	if (length === 0) return peaks;
	const samplesPerBin = length / bins;
	const channels = buffers.map((b) =>
		Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c)),
	);
	let loudest = 0;
	for (let bin = 0; bin < bins; bin++) {
		const start = Math.floor(bin * samplesPerBin);
		const end = Math.min(length, Math.floor((bin + 1) * samplesPerBin));
		let max = 0;
		for (let i = start; i < end; i++) {
			let sum = 0;
			for (const data of channels) {
				if (i >= data[0].length) continue;
				let v = 0;
				for (const channel of data) v += channel[i];
				sum += v / data.length;
			}
			const abs = Math.abs(sum);
			if (abs > max) max = abs;
		}
		peaks[bin] = max;
		if (max > loudest) loudest = max;
	}
	if (loudest > 0) for (let bin = 0; bin < bins; bin++) peaks[bin] /= loudest;
	return peaks;
}

/**
 * A stand-in for `computeMixPeaks` before the audio is decoded, from the
 * per-stem peaks the manifest carries: each stem's bins (which span that
 * stem's own length) are placed on the song's length and combined as the
 * root of the sum of squares, then normalised.
 */
export function combinePeaks(
	stems: { peaks: number[]; duration: number }[],
	duration: number,
	bins = PEAK_BINS,
): number[] {
	const peaks: number[] = Array.from({ length: bins }, () => 0);
	if (duration <= 0) return peaks;
	let loudest = 0;
	for (let bin = 0; bin < bins; bin++) {
		const t = ((bin + 0.5) / bins) * duration;
		let sum = 0;
		for (const stem of stems) {
			if (stem.peaks.length === 0 || t >= stem.duration) continue;
			const own = Math.min(
				stem.peaks.length - 1,
				Math.floor((t / stem.duration) * stem.peaks.length),
			);
			sum += stem.peaks[own] ** 2;
		}
		peaks[bin] = Math.sqrt(sum);
		if (peaks[bin] > loudest) loudest = peaks[bin];
	}
	return loudest > 0 ? peaks.map((p) => p / loudest) : peaks;
}
