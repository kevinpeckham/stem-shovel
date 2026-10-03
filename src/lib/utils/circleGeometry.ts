/**
 * The SVG geometry of a circle of twelve wedges (docs/chord-player.md),
 * after Håken Lid's svg-circle notebook and Eric Coleman's circle of
 * fifths: a 400 × 400 viewBox centred on (200, 200), angles in degrees
 * clockwise from twelve o'clock, wedge 0 centred on twelve o'clock. The
 * arch layout (Kevin) keeps the same twelve indices but places them as
 * slots: seven on a bigger arch across the top (the key and three fifths
 * each way), two small ones under each end of the arch, and none for the
 * tritone.
 */
export const CIRCLE_SIZE = 400;
const CX = CIRCLE_SIZE / 2;
const CY = CIRCLE_SIZE / 2;

/** Where a wedge is drawn: its centre, its angles (clockwise from twelve o'clock) and its size against the circle's. */
export interface WedgeSlot {
	cx: number;
	cy: number;
	start: number;
	end: number;
	scale: number;
}

/** Degrees clockwise from twelve o'clock to the SVG's own angle (clockwise from three o'clock). */
const svgDegrees = (degrees: number) => degrees - 90;

export function polarToCartesian(
	radius: number,
	degrees: number,
	cx = CX,
	cy = CY,
): [number, number] {
	const radians = (svgDegrees(degrees) * Math.PI) / 180;
	return [cx + radius * Math.cos(radians), cy + radius * Math.sin(radians)];
}

/** An annular segment from `startDegrees` to `endDegrees` (clockwise), between two radii, as an SVG path. */
export function segmentPath(
	innerRadius: number,
	outerRadius: number,
	startDegrees: number,
	endDegrees: number,
	cx = CX,
	cy = CY,
): string {
	const largeArc = Math.abs(endDegrees - startDegrees) > 180 ? 1 : 0;
	const point = (radius: number, degrees: number) =>
		polarToCartesian(radius, degrees, cx, cy)
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

/** The circle's own slots: twelve wedges of 30° around (200, 200). */
export const CIRCLE_SLOTS: (WedgeSlot | null)[] = Array.from({ length: 12 }, (_, i) => ({
	cx: CX,
	cy: CY,
	start: i * 30 - 15,
	end: i * 30 + 15,
	scale: 1,
}));

/** The arch layout's box: wider than tall, the arch's centre near the bottom. */
export const ARCH_WIDTH = 480;
export const ARCH_HEIGHT = 420;
const ARCH_CX = ARCH_WIDTH / 2;
export const ARCH_CY = 236;
/** The fans pivot on the box's sides just under the arch's ends (which dip 15° below its centre line, to ARCH_CY + 60). */
export const FAN_CY = ARCH_CY + 66;
/** The arch's outer radius against the circle's 190; the fans' 118, pivoted on the box's sides under the arch (Kevin: below, not in the top corners, the same way round). */
const ARCH_SCALE = 230 / 190;
const FAN_SCALE = 0.62;
const fan = (cx: number, start: number): WedgeSlot => ({
	cx,
	cy: FAN_CY,
	start,
	end: start + 45,
	scale: FAN_SCALE,
});
/** The arch: wedges 9 to 3 in their circle angles (a 210° arch dipping 15° below the horizontal at each end); 7 and 8 fan out from the left side under the arch's end, 4 and 5 from the right; 6 has no slot. */
export const ARCH_SLOTS: (WedgeSlot | null)[] = Array.from({ length: 12 }, (_, i) => {
	if (i <= 3 || i >= 9)
		return { cx: ARCH_CX, cy: ARCH_CY, start: i * 30 - 15, end: i * 30 + 15, scale: ARCH_SCALE };
	if (i === 7) return fan(0, 90);
	if (i === 8) return fan(0, 135);
	if (i === 4) return fan(ARCH_WIDTH, 180);
	if (i === 5) return fan(ARCH_WIDTH, 225);
	return null;
});

/** A slot's wedge between two of the circle's radii (scaled to the slot). */
export function slotPath(slot: WedgeSlot, innerRadius: number, outerRadius: number): string {
	return segmentPath(
		innerRadius * slot.scale,
		outerRadius * slot.scale,
		slot.start,
		slot.end,
		slot.cx,
		slot.cy,
	);
}
/** Where a label sits in a slot: the middle of its angle at one of the circle's radii (scaled). */
export function slotCenter(slot: WedgeSlot, radius: number): [number, number] {
	return polarToCartesian(radius * slot.scale, (slot.start + slot.end) / 2, slot.cx, slot.cy);
}
