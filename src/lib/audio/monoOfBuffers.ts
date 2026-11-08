/** One buffer's channels averaged and added into `out` (at `rate`), resampled by linear interpolation when its own rate differs. */
function addMono(out: Float32Array, buffer: AudioBuffer, rate: number): void {
	const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) =>
		buffer.getChannelData(c),
	);
	const step = buffer.sampleRate / rate;
	const scale = 1 / Math.max(1, channels.length);
	const frames = Math.min(out.length, Math.floor((buffer.length - 1) / step) + 1);
	for (let i = 0; i < frames; i++) {
		const x = i * step;
		const k = Math.floor(x);
		const t = x - k;
		for (const data of channels)
			out[i]! += (data[k]! + t * ((data[k + 1] ?? data[k]!) - data[k]!)) * scale;
	}
}

/**
 * The buffers (a mix, or every stem) summed to one mono track at the first
 * buffer's rate, channels averaged, as long as the longest, a buffer at
 * another rate resampled linearly on the way in: what the recording's
 * feature workers read (audio/alignChartInBrowser.ts,
 * audio/chartlessGridInBrowser.ts).
 */
export function monoOfBuffers(buffers: AudioBuffer[]): {
	samples: Float32Array;
	sampleRate: number;
} {
	const sampleRate = buffers[0]!.sampleRate;
	const length = Math.max(...buffers.map((b) => Math.ceil((b.length * sampleRate) / b.sampleRate)));
	const samples = new Float32Array(length);
	for (const buffer of buffers) addMono(samples, buffer, sampleRate);
	return { samples, sampleRate };
}
