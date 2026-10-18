import type { StudioFadeShape } from "#lib/val/StudioSchema.js";

/**
 * A fade as the gain values an AudioParam's `setValueCurveAtTime` takes
 * (docs/dawn-daw-plan.md, D4): `n` points from 0 to `peak` (in) or from
 * `peak` to 0 (out). Linear is a straight line; `power` is equal power
 * (a quarter sine), so two clips crossfading with it hold a steady level
 * where they meet (sin² + cos² = 1). Pure; the engine scales a clip's
 * gain by it.
 */
export function fadeCurve(
	shape: StudioFadeShape,
	direction: "in" | "out",
	peak = 1,
	n = 64,
): Float32Array {
	const out = new Float32Array(Math.max(2, n));
	for (let i = 0; i < out.length; i++) {
		const x = i / (out.length - 1);
		const up = shape === "power" ? Math.sin((x * Math.PI) / 2) : x;
		out[i] =
			peak * (direction === "in" ? up : shape === "power" ? Math.cos((x * Math.PI) / 2) : 1 - x);
	}
	return out;
}
