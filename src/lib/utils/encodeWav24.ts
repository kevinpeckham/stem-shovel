/**
 * 24-bit PCM WAV from channel data (the looper's layers and mix,
 * docs/looper.md), interleaved, little-endian, a 44-byte header: the
 * resolution a layer deserves when it becomes a song's stem. The 16-bit
 * encoder (encodeWav.ts) stays for the recorder's downloads. `chunks` are
 * whole extra chunks (a `bext`, utils/bext.ts) written between `fmt ` and
 * `data`, each already padded to an even length. Pure, so a test can read
 * the bytes back; the caller wraps the result in a Blob.
 */
export function encodeWav24(
	channels: Float32Array[],
	sampleRate: number,
	chunks: Uint8Array[] = [],
): ArrayBuffer {
	const n = channels[0]?.length ?? 0;
	const ch = channels.length;
	const dataSize = n * ch * 3;
	const extra = chunks.reduce((sum, c) => sum + c.length, 0);
	const out = new ArrayBuffer(44 + extra + dataSize);
	const v = new DataView(out);
	const ascii = (at: number, s: string) => {
		for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i));
	};
	ascii(0, "RIFF");
	v.setUint32(4, 36 + extra + dataSize, true);
	ascii(8, "WAVE");
	ascii(12, "fmt ");
	v.setUint32(16, 16, true);
	v.setUint16(20, 1, true); // PCM
	v.setUint16(22, ch, true);
	v.setUint32(24, sampleRate, true);
	v.setUint32(28, sampleRate * ch * 3, true);
	v.setUint16(32, ch * 3, true);
	v.setUint16(34, 24, true);
	let at = 36;
	const bytes = new Uint8Array(out);
	for (const c of chunks) {
		bytes.set(c, at);
		at += c.length;
	}
	ascii(at, "data");
	v.setUint32(at + 4, dataSize, true);
	at += 8;
	for (let i = 0; i < n; i++) {
		for (let c = 0; c < ch; c++) {
			const x = Math.max(-1, Math.min(1, channels[c][i] ?? 0));
			const s = Math.round(x * 8388607);
			v.setUint8(at, s & 0xff);
			v.setUint8(at + 1, (s >> 8) & 0xff);
			v.setUint8(at + 2, (s >> 16) & 0xff);
			at += 3;
		}
	}
	return out;
}
