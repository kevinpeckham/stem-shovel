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
