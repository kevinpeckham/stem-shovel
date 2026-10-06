/**
 * What a file's first bytes say it is (docs/security.md, "Input and
 * output"): the server trusts these over any content type a browser sent.
 */
export function isPdfBytes(head: Uint8Array): boolean {
	// "%PDF-" at the very start (the spec allows junk before it; we do not).
	return (
		head.length >= 5 &&
		head[0] === 0x25 &&
		head[1] === 0x50 &&
		head[2] === 0x44 &&
		head[3] === 0x46 &&
		head[4] === 0x2d
	);
}

/** "image/webp" or "image/png" from the signature, else null. */
export function imageTypeOfBytes(head: Uint8Array): "image/webp" | "image/png" | null {
	if (
		head.length >= 12 &&
		head[0] === 0x52 &&
		head[1] === 0x49 &&
		head[2] === 0x46 &&
		head[3] === 0x46 &&
		head[8] === 0x57 &&
		head[9] === 0x45 &&
		head[10] === 0x42 &&
		head[11] === 0x50
	)
		return "image/webp";
	if (
		head.length >= 8 &&
		head[0] === 0x89 &&
		head[1] === 0x50 &&
		head[2] === 0x4e &&
		head[3] === 0x47 &&
		head[4] === 0x0d &&
		head[5] === 0x0a &&
		head[6] === 0x1a &&
		head[7] === 0x0a
	)
		return "image/png";
	return null;
}

/** A zip archive's local file header ("PK\x03\x04"): what a compressed MusicXML file (`.mxl`) starts with. */
export function startsLikeZip(bytes: Uint8Array): boolean {
	return (
		bytes.length >= 4 &&
		bytes[0] === 0x50 &&
		bytes[1] === 0x4b &&
		bytes[2] === 0x03 &&
		bytes[3] === 0x04
	);
}

/**
 * Whether the first bytes read like an uncompressed MusicXML document
 * (docs/security.md): decoded as UTF-8 (a BOM ignored, up to 4 KB), after
 * optional whitespace the text starts with an XML declaration, a DOCTYPE or
 * the score element itself, and names a `score-partwise` or
 * `score-timewise` somewhere in that head. A sniff, not a parse: the server
 * never parses untrusted XML.
 */
export function startsLikeMusicXml(bytes: Uint8Array): boolean {
	const text = new TextDecoder("utf-8").decode(bytes.subarray(0, 4096));
	const trimmed = text.trimStart();
	const prologue =
		trimmed.startsWith("<?xml") || trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<score-");
	return prologue && (text.includes("score-partwise") || text.includes("score-timewise"));
}

/** Whether the ASCII `text` sits at byte offset `at`. */
function ascii(bytes: Uint8Array, at: number, text: string): boolean {
	if (bytes.length < at + text.length) return false;
	for (let i = 0; i < text.length; i++) if (bytes[at + i] !== text.charCodeAt(i)) return false;
	return true;
}

/** PNG, JPEG, WebP (`RIFF….WEBP`) or GIF by its first bytes. */
export function startsLikeImage(bytes: Uint8Array): boolean {
	if (imageTypeOfBytes(bytes)) return true;
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
	return ascii(bytes, 0, "GIF87a") || ascii(bytes, 0, "GIF89a");
}

/**
 * An audio file by its first bytes: MP3 (an `ID3` tag or an MPEG audio
 * frame sync), WAV (`RIFF….WAVE`), M4A/MP4 (`ftyp` at offset 4), raw AAC
 * (an ADTS frame sync), OGG (`OggS`), FLAC (`fLaC`), AIFF (`FORM….AIFF`
 * or `AIFC`).
 */
export function startsLikeAudio(bytes: Uint8Array): boolean {
	if (ascii(bytes, 0, "ID3")) return true;
	if (bytes.length >= 2 && bytes[0] === 0xff) {
		const b = bytes[1]!;
		// MPEG-1/2 layer III (0xFB/0xFA/0xF3/0xF2), layer II (0xFD/0xFC), MPEG-2.5 (0xE3/0xE2) and ADTS AAC (0xF1/0xF9).
		if ([0xfb, 0xfa, 0xf3, 0xf2, 0xfd, 0xfc, 0xe3, 0xe2, 0xf1, 0xf9].includes(b)) return true;
	}
	if (ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WAVE")) return true;
	if (ascii(bytes, 4, "ftyp")) return true;
	if (ascii(bytes, 0, "OggS") || ascii(bytes, 0, "fLaC")) return true;
	return ascii(bytes, 0, "FORM") && (ascii(bytes, 8, "AIFF") || ascii(bytes, 8, "AIFC"));
}

/** A Standard MIDI File: the `MThd` header chunk. */
export function startsLikeMidi(bytes: Uint8Array): boolean {
	return ascii(bytes, 0, "MThd");
}

/** Text: the first 4 KB decode as UTF-8 without a NUL byte (a BOM is fine; an empty file is not text). */
export function looksLikeText(bytes: Uint8Array): boolean {
	const head = bytes.subarray(0, 4096);
	if (head.length === 0 || head.includes(0)) return false;
	try {
		// Streaming, so a multi-byte sequence cut at the 4 KB edge waits rather than fails; a bad byte inside still throws.
		new TextDecoder("utf-8", { fatal: true }).decode(head, { stream: true });
		return true;
	} catch {
		return false;
	}
}
