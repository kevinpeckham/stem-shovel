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
