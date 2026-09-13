/** A minimal AudioBuffer for the pure audio helpers (no Web Audio in Node). */
export function fakeAudioBuffer(channels: Float32Array[], sampleRate = 32_000): AudioBuffer {
	const length = channels[0]?.length ?? 0;
	return {
		numberOfChannels: channels.length,
		length,
		sampleRate,
		duration: length / sampleRate,
		getChannelData: (i: number) => channels[i],
		copyToChannel: (source: Float32Array, i: number) => channels[i].set(source),
		copyFromChannel: () => {},
	} as unknown as AudioBuffer;
}

/** A BaseAudioContext that can only createBuffer(), which is all collapseDualMono needs. */
export function fakeContext(): BaseAudioContext {
	return {
		createBuffer: (n: number, length: number, sampleRate: number) =>
			fakeAudioBuffer(
				Array.from({ length: n }, () => new Float32Array(length)),
				sampleRate,
			),
	} as unknown as BaseAudioContext;
}
