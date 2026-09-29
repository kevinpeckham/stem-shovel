/**
 * The Grand Piano's velocity layers (docs/piano.md, "Sample tiers"): the
 * Salamander has sixteen, v1 the softest, each covering an eighth of the
 * velocity range; we ship a few of them per tier. A note at a velocity
 * plays the two loaded layers on either side of it, crossfaded, so a run
 * from soft to loud moves smoothly through the recordings rather than
 * jumping; at the ends, the one nearest layer alone.
 */

/** The velocity (0 to 1) at the middle of a Salamander layer's range. */
export const layerVelocity = (layer: number) => (layer - 0.5) / 16;

/** The layers to play for a velocity, from the ones loaded, with their gains (summing to one). */
export function layerMix(
	velocity: number,
	loaded: readonly number[],
): { layer: number; gain: number }[] {
	const layers = [...loaded].sort((a, b) => a - b);
	if (layers.length === 0) return [];
	const v = Math.min(1, Math.max(0, velocity));
	const first = layers[0]!;
	const last = layers[layers.length - 1]!;
	if (v <= layerVelocity(first)) return [{ layer: first, gain: 1 }];
	if (v >= layerVelocity(last)) return [{ layer: last, gain: 1 }];
	for (let i = 0; i < layers.length - 1; i++) {
		const lo = layers[i]!;
		const hi = layers[i + 1]!;
		const a = layerVelocity(lo);
		const b = layerVelocity(hi);
		if (v >= a && v <= b) {
			const t = (v - a) / (b - a);
			// Equal-power: the sum stays level through the crossfade.
			return [
				{ layer: lo, gain: Math.cos((t * Math.PI) / 2) },
				{ layer: hi, gain: Math.sin((t * Math.PI) / 2) },
			].filter((x) => x.gain > 0.001);
		}
	}
	return [{ layer: last, gain: 1 }];
}
