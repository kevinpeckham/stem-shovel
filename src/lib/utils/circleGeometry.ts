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

/** The rings' radii in the circle: the minors from R_MINOR_IN to R_MAJOR_IN, the majors out to R_OUTER. */
export const R_OUTER = 190;
export const R_MAJOR_IN = 130;
export const R_MINOR_IN = 72;

/**
 * Where a wedge is drawn. An arc slot is a sector of a circle: its centre,
 * its angles (clockwise from twelve o'clock) and its size against the
 * circle's. A leg slot is a straight continuation of an arch's end (Kevin):
 * a rectangle whose first edge is the end wedge's face, from `o` (the
 * inner radius) along the radial unit vector `u`, extending from `t0` to
 * `t1` along `v`, the tangent pointing down; `ring` maps a circle radius
 * to a distance along `u`.
 */
export type WedgeSlot = ArcSlot | LegSlot;
export interface ArcSlot {
	kind: "arc";
	cx: number;
	cy: number;
	start: number;
	end: number;
	scale: number;
	/** The labels' size when it is not the geometry's (a wedge cut narrow). */
	labelScale?: number;
}
export interface LegSlot {
	kind: "leg";
	ox: number;
	oy: number;
	ux: number;
	uy: number;
	vx: number;
	vy: number;
	t0: number;
	t1: number;
	ring: number;
	/** The labels' size against the circle's. */
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
	kind: "arc",
	cx: CX,
	cy: CY,
	start: i * 30 - 15,
	end: i * 30 + 15,
	scale: 1,
}));

/** The arch layout's box: the arch across the top, cut flat at the horizontal, its ends continued straight down as legs of two keys each. */
export const ARCH_WIDTH = 480;
export const ARCH_HEIGHT = 320;
const ARCH_CX = ARCH_WIDTH / 2;
export const ARCH_CY = 236;
/** The arch's outer radius against the circle's 190. */
const ARCH_SCALE = 230 / 190;
/** Each leg key's length along the leg: about a third of an arch wedge's middle arc (Kevin: half as tall as first drawn), its labels smaller to match. */
const LEG_KEY = 32;
const LEG_SCALE = 0.6;
/** A key on the leg continuing the arch's end at `endDegrees`, `step` keys down from the end face. */
function leg(endDegrees: number, step: number): LegSlot {
	const rad = ((endDegrees - 90) * Math.PI) / 180;
	const ux = Math.cos(rad);
	const uy = Math.sin(rad);
	const [ox, oy] = polarToCartesian(R_MINOR_IN * ARCH_SCALE, endDegrees, ARCH_CX, ARCH_CY);
	// The tangent, the way that points down the page.
	const flip = ux < 0 ? -1 : 1;
	const vx = -uy * flip;
	const vy = ux * flip;
	return {
		kind: "leg",
		ox,
		oy,
		ux,
		uy,
		vx,
		vy,
		t0: step * LEG_KEY,
		t1: (step + 1) * LEG_KEY,
		ring: ARCH_SCALE,
		scale: LEG_SCALE,
	};
}
/** The arch: wedges 9 to 3 in their circle angles, the two end wedges cut at the horizontal (Kevin) so the arch is a half circle with level faces; 8 and 7 continue the left face straight down as a leg, 4 and 5 the right; 6 has no slot. */
export const ARCH_SLOTS: (WedgeSlot | null)[] = Array.from({ length: 12 }, (_, i) => {
	if (i <= 3 || i >= 9) {
		const start = i === 9 ? 270 : i * 30 - 15;
		const end = i === 3 ? 90 : i * 30 + 15;
		return {
			kind: "arc",
			cx: ARCH_CX,
			cy: ARCH_CY,
			start,
			end,
			scale: ARCH_SCALE,
			...(end - start < 30 ? { labelScale: 0.8 } : {}),
		};
	}
	if (i === 8) return leg(270, 0);
	if (i === 7) return leg(270, 1);
	if (i === 4) return leg(90, 0);
	if (i === 5) return leg(90, 1);
	return null;
});

/** A slot mirrored top to bottom in the arch's box: the arch becomes a bowl with the key at the bottom, the legs rise from its ends (Kevin: for a thumb on a phone). */
function flipSlot(slot: WedgeSlot | null): WedgeSlot | null {
	if (!slot) return null;
	if (slot.kind === "leg")
		return { ...slot, oy: ARCH_HEIGHT - slot.oy, uy: -slot.uy, vy: -slot.vy };
	return { ...slot, cy: ARCH_HEIGHT - slot.cy, start: 180 - slot.end, end: 180 - slot.start };
}
/** The arch upside down: wedge 0 at the bottom, 9 and 3 level at the top of the bowl, the legs going up. */
export const ARCH_DOWN_SLOTS: (WedgeSlot | null)[] = ARCH_SLOTS.map(flipSlot);

/** A point of a leg: `s` along the face from the inner radius, `t` down the leg. */
function legPoint(slot: LegSlot, s: number, t: number): [number, number] {
	return [slot.ox + slot.ux * s + slot.vx * t, slot.oy + slot.uy * s + slot.vy * t];
}
const legS = (slot: LegSlot, radius: number) => (radius - R_MINOR_IN) * slot.ring;

/** A slot's wedge between two of the circle's radii (scaled to the slot): a sector, or a leg's rectangle. */
export function slotPath(slot: WedgeSlot, innerRadius: number, outerRadius: number): string {
	if (slot.kind === "leg") {
		const sIn = legS(slot, innerRadius);
		const sOut = legS(slot, outerRadius);
		const corners = [
			legPoint(slot, sIn, slot.t0),
			legPoint(slot, sOut, slot.t0),
			legPoint(slot, sOut, slot.t1),
			legPoint(slot, sIn, slot.t1),
		];
		return `M${corners.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join("L")}Z`;
	}
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
	if (slot.kind === "leg") return legPoint(slot, legS(slot, radius), (slot.t0 + slot.t1) / 2);
	return polarToCartesian(radius * slot.scale, (slot.start + slot.end) / 2, slot.cx, slot.cy);
}
