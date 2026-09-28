/**
 * A small seeded random number generator (mulberry32): the same seed gives
 * the same sequence, so a generated pattern can be tested and, one day,
 * shared by its seed. Returns numbers in [0, 1) like Math.random.
 */
export function seededRandom(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
