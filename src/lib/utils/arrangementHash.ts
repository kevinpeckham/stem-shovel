/**
 * A short, stable hash of a Studio arrangement (any JSON value), the same
 * in the browser and on the server: the browser skips an autosave whose
 * hash matches the last one it sent, and the server skips a write whose
 * hash matches the newest revision's. Keys are sorted before hashing, so
 * an object valibot rebuilt in schema order hashes like the browser's own.
 * Two 32-bit FNV-1a lanes with different seeds give 16 hex characters —
 * collisions only cost a redundant write, so cryptographic strength is
 * not needed and `crypto.subtle` (async, absent on insecure origins) is.
 */
export function arrangementHash(data: unknown): string {
	const text = canonical(data);
	return (
		lane(text, 0x811c9dc5).toString(16).padStart(8, "0") +
		lane(text, 0x050c5d1f).toString(16).padStart(8, "0")
	);
}

function lane(text: string, seed: number): number {
	let h = seed >>> 0;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h;
}

/** JSON with every object's keys in sorted order; undefined members are dropped as JSON.stringify drops them. */
function canonical(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map((v) => canonical(v ?? null)).join(",")}]`;
	if (value && typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>)
			.filter(([, v]) => v !== undefined)
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
		return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
	}
	return JSON.stringify(value ?? null);
}
