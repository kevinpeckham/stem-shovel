/**
 * Reduce an AudioBuffer to `bins` peak values (max absolute sample per bin,
 * across all channels). The result is what the waveform canvas draws and,
 * later, what gets stored in Turso so reviewers never have to decode audio
 * just to see a waveform.
 */
export function computePeaks(buffer: AudioBuffer, bins = 1024): Float32Array {
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
