/**
 * A quick fingerprint of a file's bytes (cyrb53, 53 bits, as hex), to tell
 * the same file dropped twice. Not cryptographic: it needs no secure
 * context (crypto.subtle is missing on a plain-http dev address), and a
 * collision between two real samples of the same size is not a concern.
 */
export function hashBytes(bytes: Uint8Array, seed = 0): string {
	let h1 = 0xdeadbeef ^ seed;
	let h2 = 0x41c6ce57 ^ seed;
	for (let i = 0; i < bytes.length; i++) {
		const b = bytes[i]!;
		h1 = Math.imul(h1 ^ b, 2654435761);
		h2 = Math.imul(h2 ^ b, 1597334677);
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
	return `${bytes.length.toString(16)}-${n.toString(16)}`;
}
