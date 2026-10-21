/**
 * A file's own sample rate from its header: WAV and RF64, AIFF and AIFC,
 * FLAC, MP3 (after any ID3v2 tag), MP4 (M4A, AAC) and Ogg (Vorbis, Opus),
 * or null for anything else. `decodeAudioData` resamples to its context's
 * rate and never says what the file was (FINDINGS.md), so an import, an
 * upload or the converter learns the rate here to compare with the song's
 * (docs/multitrack-recorder.md "Sample rates"). Pure.
 */
export function audioSampleRate(bytes: Uint8Array): number | null {
	const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const tag = (at: number) =>
		at + 4 <= bytes.length
			? String.fromCharCode(bytes[at]!, bytes[at + 1]!, bytes[at + 2]!, bytes[at + 3]!)
			: "";
	const head = tag(0);
	let rate: number | null = null;
	if ((head === "RIFF" || head === "RF64") && tag(8) === "WAVE") rate = riff(v, bytes, tag);
	else if (head === "FORM" && (tag(8) === "AIFF" || tag(8) === "AIFC")) rate = aiff(v, bytes, tag);
	else if (head === "fLaC") rate = flac(bytes);
	else if (head === "OggS") rate = ogg(v, bytes, tag);
	else if (tag(4) === "ftyp") rate = mp4(v, bytes);
	else if (head.startsWith("ID3") || isSync(bytes, 0)) rate = mp3(bytes);
	return rate && rate >= 8000 && rate <= 384_000 ? rate : null;
}

/** The "fmt " chunk's rate, little-endian, chunks padded to even sizes. */
function riff(v: DataView, bytes: Uint8Array, tag: (at: number) => string): number | null {
	let at = 12;
	while (at + 8 <= bytes.length) {
		const id = tag(at);
		const size = v.getUint32(at + 4, true);
		if (id === "fmt ") return at + 16 <= bytes.length ? v.getUint32(at + 12, true) : null;
		if (id === "data") return null;
		at += 8 + size + (size % 2);
	}
	return null;
}

/** The COMM chunk's rate, an 80-bit extended float after the channels, frames and sample size. */
function aiff(v: DataView, bytes: Uint8Array, tag: (at: number) => string): number | null {
	let at = 12;
	while (at + 8 <= bytes.length) {
		const id = tag(at);
		const size = v.getUint32(at + 4, false);
		if (id === "COMM") {
			const p = at + 16;
			if (p + 10 > bytes.length) return null;
			const exponent = (v.getUint16(p, false) & 0x7fff) - 16383;
			const mantissa = v.getUint32(p + 2, false) * 2 ** 32 + v.getUint32(p + 6, false);
			return Math.round(mantissa * 2 ** (exponent - 63));
		}
		at += 8 + size + (size % 2);
	}
	return null;
}

/** STREAMINFO, the first metadata block: 20 bits of rate at its tenth byte. */
function flac(bytes: Uint8Array): number | null {
	if (bytes.length < 21 || (bytes[4]! & 0x7f) !== 0) return null;
	return (bytes[18]! << 12) | (bytes[19]! << 4) | (bytes[20]! >> 4);
}

/** The first page's packet: a Vorbis identification header carries the rate; Opus always decodes at 48 kHz. */
function ogg(v: DataView, bytes: Uint8Array, tag: (at: number) => string): number | null {
	const segments = bytes[26] ?? 0;
	const p = 27 + segments;
	if (p + 16 > bytes.length) return null;
	if (bytes[p] === 1 && tag(p + 1) === "vorb") return v.getUint32(p + 12, true);
	if (tag(p) === "Opus" && tag(p + 4) === "Head") return 48_000;
	return null;
}

/** The audio sample entry ("mp4a", or "alac" and "fLaC" in an MP4): the rate's whole part, 16.16 fixed, 28 bytes in. */
function mp4(v: DataView, bytes: Uint8Array): number | null {
	for (let i = 0; i + 30 <= bytes.length; i++) {
		if (
			bytes[i] === 0x6d &&
			bytes[i + 1] === 0x70 &&
			bytes[i + 2] === 0x34 &&
			bytes[i + 3] === 0x61
		)
			return v.getUint16(i + 28, false) || null;
		if (
			bytes[i] === 0x61 &&
			bytes[i + 1] === 0x6c &&
			bytes[i + 2] === 0x61 &&
			bytes[i + 3] === 0x63
		)
			return v.getUint16(i + 28, false) || null;
	}
	return null;
}

const MPEG1_RATES = [44_100, 48_000, 32_000];
function isSync(bytes: Uint8Array, at: number) {
	return bytes[at] === 0xff && ((bytes[at + 1] ?? 0) & 0xe0) === 0xe0;
}

/** The first frame header after any ID3v2 tag: the version halves the MPEG-1 rates, MPEG-2.5 quarters them. */
function mp3(bytes: Uint8Array): number | null {
	let at = 0;
	if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33 && bytes.length >= 10) {
		const size =
			((bytes[6]! & 0x7f) << 21) |
			((bytes[7]! & 0x7f) << 14) |
			((bytes[8]! & 0x7f) << 7) |
			(bytes[9]! & 0x7f);
		at = 10 + size + (bytes[5]! & 0x10 ? 10 : 0);
	}
	const end = Math.min(bytes.length - 4, at + 65_536);
	for (let i = at; i <= end; i++) {
		if (!isSync(bytes, i)) continue;
		const version = (bytes[i + 1]! >> 3) & 3;
		const layer = (bytes[i + 1]! >> 1) & 3;
		const index = (bytes[i + 2]! >> 2) & 3;
		if (version === 1 || layer === 0 || index === 3) continue;
		const base = MPEG1_RATES[index]!;
		return version === 3 ? base : version === 2 ? base / 2 : base / 4;
	}
	return null;
}
