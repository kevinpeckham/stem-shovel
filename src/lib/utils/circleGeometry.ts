/**
 * The SVG geometry of a circle of twelve wedges (docs/chord-player.md),
 * after Håken Lid's svg-circle notebook and Eric Coleman's circle of
 * fifths: a 400 × 400 viewBox centred on (200, 200), angles in degrees
 * clockwise from twelve o'clock, wedge 0 centred on twelve o'clock.
 */
export const CIRCLE_SIZE = 400;
const CX = CIRCLE_SIZE / 2;
const CY = CIRCLE_SIZE / 2;

/** Degrees clockwise from twelve o'clock to the SVG's own angle (clockwise from three o'clock). */
const svgDegrees = (degrees: number) => degrees - 90;

export function polarToCartesian(radius: number, degrees: number): [number, number] {
	const radians = (svgDegrees(degrees) * Math.PI) / 180;
	return [CX + radius * Math.cos(radians), CY + radius * Math.sin(radians)];
}

/** An annular segment from `startDegrees` to `endDegrees` (clockwise), between two radii, as an SVG path. */
export function segmentPath(
	innerRadius: number,
	outerRadius: number,
	startDegrees: number,
	endDegrees: number,
): string {
	const largeArc = Math.abs(endDegrees - startDegrees) > 180 ? 1 : 0;
	const point = (radius: number, degrees: number) =>
		polarToCartesian(radius, degrees)
			.map((n) => n.toFixed(2))
			.join(",");
	return [
		`M${point(innerRadius, startDegrees)}`,
		`A${innerRadius},${innerRadius},0,${largeArc},1,${point(innerRadius, endDegrees)}`,
		`L${point(outerRadius, endDegrees)}`,
		`A${outerRadius},${outerRadius},0,${largeArc},0,${point(outerRadius, startDegrees)}`,
		"Z",
	].join("");
}

/** Wedge `index` of `total`, the first centred on twelve o'clock, between two radii. */
export function wedgePath(
	innerRadius: number,
	outerRadius: number,
	index: number,
	total = 12,
): string {
	const each = 360 / total;
	const start = index * each - each / 2;
	return segmentPath(innerRadius, outerRadius, start, start + each);
}

/** Where a label sits: the middle of wedge `index` at `radius`. */
export function wedgeCenter(radius: number, index: number, total = 12): [number, number] {
	return polarToCartesian(radius, (360 / total) * index);
}
