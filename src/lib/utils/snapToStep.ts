/**
 * A control's value on its step grid and within its range, as an
 * `<input type="range">` would give it: counted in steps from `min`,
 * rounded to the nearest, clamped, and tidied to the step's decimals so
 * 0.1 + 0.2 never shows as 0.30000000000000004 (the knob and the slider,
 * src/lib/components/Knob.svelte and Slider.svelte).
 */
export function snapToStep(value: number, min: number, max: number, step: number): number {
	const lo = Math.min(min, max);
	const hi = Math.max(min, max);
	const clamped = Math.max(lo, Math.min(hi, value));
	if (!(step > 0)) return clamped;
	const decimals = Math.max(0, Math.min(10, Math.ceil(-Math.log10(step)) + 1));
	const snapped = Math.round((clamped - lo) / step) * step + lo;
	return Number(Math.max(lo, Math.min(hi, snapped)).toFixed(decimals));
}
