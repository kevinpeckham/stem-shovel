/**
 * A buffer at another rate, through an `OfflineAudioContext` at that rate
 * (the browser's own resampler, the one `decodeAudioData` uses): the song's
 * rate for an export when the device decoded at its own
 * (docs/multitrack-recorder.md "Sample rates"). The same buffer comes
 * back when the rates agree. Browser only.
 */
export async function resampleBuffer(
	buffer: AudioBuffer,
	sampleRate: number,
): Promise<AudioBuffer> {
	if (buffer.sampleRate === sampleRate) return buffer;
	const length = Math.max(1, Math.ceil(buffer.duration * sampleRate));
	const off = new OfflineAudioContext(buffer.numberOfChannels, length, sampleRate);
	const source = off.createBufferSource();
	source.buffer = buffer;
	source.connect(off.destination);
	source.start(0);
	return off.startRendering();
}
