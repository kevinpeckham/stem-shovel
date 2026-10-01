/**
 * The looper's microphone calibration (docs/looper.md): clicks were played
 * at known moments and the microphone recorded; how late did they arrive?
 * For each click, the loudest moment within a window after it is where
 * the click landed (a click is far above the room); the answer is the
 * median of the delays, in milliseconds, or null when fewer than two
 * clicks stood out from the noise (no speaker, or the microphone muted).
 */
export function findLatency(
	recorded: Float32Array,
	sampleRate: number,
	clicksAtSeconds: number[],
	windowSeconds = 0.25,
): number | null {
	const window = Math.round(windowSeconds * sampleRate);
	// The noise floor: the median absolute sample, so one click does not set it.
	const floor = medianAbs(recorded);
	const delays: number[] = [];
	for (const t of clicksAtSeconds) {
		const from = Math.round(t * sampleRate);
		let best = -1;
		let peak = 0;
		for (let i = from; i < Math.min(recorded.length, from + window); i++) {
			const a = Math.abs(recorded[i]);
			if (a > peak) {
				peak = a;
				best = i;
			}
		}
		// A click stands at least 20 dB above the floor; else that click was not heard.
		if (best >= 0 && peak > Math.max(0.01, floor * 10))
			delays.push(((best - from) / sampleRate) * 1000);
	}
	if (delays.length < 2) return null;
	delays.sort((a, b) => a - b);
	return delays[Math.floor(delays.length / 2)];
}

function medianAbs(x: Float32Array): number {
	const step = Math.max(1, Math.floor(x.length / 4096));
	const sample: number[] = [];
	for (let i = 0; i < x.length; i += step) sample.push(Math.abs(x[i]));
	sample.sort((a, b) => a - b);
	return sample[Math.floor(sample.length / 2)] ?? 0;
}
