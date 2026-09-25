/**
 * Decoded audio as a WAV file (16-bit PCM, interleaved): the lossless
 * container every player and DAW opens. The recorder uses it for a take
 * Chrome recorded as raw PCM in WebM, which almost nothing else can read,
 * until the jobs function has turned the saved take into FLAC.
 */
export function encodeWav(channels: Float32Array[], sampleRate: number): Blob {
	const channelCount = channels.length;
	const frames = channels[0]?.length ?? 0;
	const bytesPerSample = 2;
	const dataBytes = frames * channelCount * bytesPerSample;
	const buffer = new ArrayBuffer(44 + dataBytes);
	const view = new DataView(buffer);
	const ascii = (offset: number, s: string) => {
		for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
	};
	ascii(0, "RIFF");
	view.setUint32(4, 36 + dataBytes, true);
	ascii(8, "WAVE");
	ascii(12, "fmt ");
	view.setUint32(16, 16, true); // PCM chunk size
	view.setUint16(20, 1, true); // PCM
	view.setUint16(22, channelCount, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
	view.setUint16(32, channelCount * bytesPerSample, true);
	view.setUint16(34, 8 * bytesPerSample, true);
	ascii(36, "data");
	view.setUint32(40, dataBytes, true);
	let offset = 44;
	for (let i = 0; i < frames; i++) {
		for (let c = 0; c < channelCount; c++) {
			const x = Math.max(-1, Math.min(1, channels[c][i]));
			view.setInt16(offset, Math.round(x < 0 ? x * 0x8000 : x * 0x7fff), true);
			offset += 2;
		}
	}
	return new Blob([buffer], { type: "audio/wav" });
}
