import { describe, expect, it } from "vite-plus/test";
import {
	ARCH_CY,
	ARCH_SLOTS,
	CIRCLE_SLOTS,
	polarToCartesian,
	segmentPath,
	slotCenter,
	slotPath,
	wedgeCenter,
	wedgePath,
} from "./circleGeometry";

describe("circleGeometry", () => {
	it("measures angles clockwise from twelve o'clock", () => {
		const [x0, y0] = polarToCartesian(100, 0);
		expect(x0).toBeCloseTo(200);
		expect(y0).toBeCloseTo(100);
		const [x90, y90] = polarToCartesian(100, 90);
		expect(x90).toBeCloseTo(300);
		expect(y90).toBeCloseTo(200);
	});
	it("centres the first wedge on twelve o'clock and the fourth on three", () => {
		expect(wedgeCenter(150, 0)).toEqual([200, 50]);
		const [x, y] = wedgeCenter(150, 3);
		expect(x).toBeCloseTo(350);
		expect(y).toBeCloseTo(200);
	});
	it("draws a wedge as a closed path of two arcs", () => {
		const d = wedgePath(80, 180, 0);
		expect(d.startsWith("M")).toBe(true);
		expect(d.endsWith("Z")).toBe(true);
		expect(d.match(/A/g)?.length).toBe(2);
		// The first point is on the inner radius at the wedge's start, 15° anticlockwise of the top.
		const [x, y] = polarToCartesian(80, -15);
		expect(d).toContain(`M${x.toFixed(2)},${y.toFixed(2)}`);
	});
	it("flags the large arc only past a half turn", () => {
		expect(segmentPath(10, 20, 0, 90)).toContain(",0,1,");
		expect(segmentPath(10, 20, 0, 270)).toContain(",1,1,");
	});
});

describe("the arch layout", () => {
	it("keeps the circle's wedges as slots of one", () => {
		expect(CIRCLE_SLOTS[0]).toEqual({ cx: 200, cy: 200, start: -15, end: 15, scale: 1 });
		expect(slotPath(CIRCLE_SLOTS[0]!, 80, 180)).toBe(wedgePath(80, 180, 0));
		expect(slotCenter(CIRCLE_SLOTS[3]!, 150)[0]).toBeCloseTo(350);
	});
	it("puts the key and three fifths each way on the arch, four in the corners, and drops the tritone", () => {
		expect(ARCH_SLOTS[6]).toBeNull();
		for (const i of [9, 10, 11, 0, 1, 2, 3]) expect(ARCH_SLOTS[i]!.cy).toBe(ARCH_CY);
		expect(ARCH_SLOTS[7]!.cx).toBe(0);
		expect(ARCH_SLOTS[8]!.cx).toBe(0);
		expect(ARCH_SLOTS[4]!.cx).toBe(480);
		expect(ARCH_SLOTS[5]!.cx).toBe(480);
		// The corner fans point into the box: 7 along the top edge, 8 down the left edge.
		const [x7, y7] = slotCenter(ARCH_SLOTS[7]!, 150);
		const [x8, y8] = slotCenter(ARCH_SLOTS[8]!, 150);
		expect(x7).toBeGreaterThan(x8);
		expect(y7).toBeLessThan(y8);
		expect(x7).toBeGreaterThan(0);
		expect(y8).toBeGreaterThan(0);
	});
	it("keeps the corner fans clear of the arch", () => {
		// The fan's farthest point into the box, at 135°, lies above the arch's outer edge at that x.
		const [x, y] = slotCenter(ARCH_SLOTS[7]!, 190);
		const archTop = ARCH_CY - Math.sqrt(230 ** 2 - (240 - x) ** 2);
		expect(y).toBeLessThan(archTop);
	});
});
