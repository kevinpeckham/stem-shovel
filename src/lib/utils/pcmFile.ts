/**
 * The Studio's disk copy of a decoded source (audio/pcmCache.ts,
 * docs/multitrack-recorder.md "Scale and structure"): a 20-byte header
 * (the magic "SSPCM1", two spare bytes, then the rate, the channel count
 * and the frame count as little-endian 32-bit integers) followed by each
 * channel's samples whole, as 32-bit floats. Float, not 16-bit: the Studio
 * keeps 24-bit sources and an export re-encodes from the decoded buffer,
 * so anything narrower would degrade the export; disk is cheap.
 */
const MAGIC = "SSPCM1";
const HEADER_BYTES = 20;

export function encodePcmFile(channels: Float32Array[], sampleRate: number): Uint8Array {
	const frames = channels[0]?.length ?? 0;
	const out = new Uint8Array(HEADER_BYTES + channels.length * frames * 4);
	const view = new DataView(out.buffer);
	for (let i = 0; i < MAGIC.length; i++) out[i] = MAGIC.charCodeAt(i);
	view.setUint32(8, sampleRate, true);
	view.setUint32(12, channels.length, true);
	view.setUint32(16, frames, true);
	const samples = new Float32Array(out.buffer, HEADER_BYTES);
	channels.forEach((ch, i) => samples.set(ch.subarray(0, frames), i * frames));
	return out;
}

/** The channels back (views on `bytes`, not copies), or null when the bytes are not such a file or are cut short. */
export function decodePcmFile(
	bytes: ArrayBuffer,
): { sampleRate: number; channels: Float32Array[] } | null {
	if (bytes.byteLength < HEADER_BYTES) return null;
	const head = new Uint8Array(bytes, 0, MAGIC.length);
	for (let i = 0; i < MAGIC.length; i++) if (head[i] !== MAGIC.charCodeAt(i)) return null;
	const view = new DataView(bytes);
	const sampleRate = view.getUint32(8, true);
	const count = view.getUint32(12, true);
	const frames = view.getUint32(16, true);
	if (!sampleRate || !count || bytes.byteLength !== HEADER_BYTES + count * frames * 4) return null;
	return {
		sampleRate,
		channels: Array.from(
			{ length: count },
			(_, i) => new Float32Array(bytes, HEADER_BYTES + i * frames * 4, frames),
		),
	};
}
