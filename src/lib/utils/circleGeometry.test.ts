import { describe, expect, it } from "vite-plus/test";
import {
	ARCH_CY,
	ARCH_DOWN_SLOTS,
	ARCH_HEIGHT,
	ARCH_SLOTS,
	R_MAJOR_IN,
	R_OUTER,
	type ArcSlot,
	type LegSlot,
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
		expect(CIRCLE_SLOTS[0]).toEqual({
			kind: "arc",
			cx: 200,
			cy: 200,
			start: -15,
			end: 15,
			scale: 1,
		});
		expect(slotPath(CIRCLE_SLOTS[0]!, 80, 180)).toBe(wedgePath(80, 180, 0));
		expect(slotCenter(CIRCLE_SLOTS[3]!, 150)[0]).toBeCloseTo(350);
	});
	it("puts the key and three fifths each way on the arch, four on legs under its ends, and drops the tritone", () => {
		expect(ARCH_SLOTS[6]).toBeNull();
		for (const i of [9, 10, 11, 0, 1, 2, 3]) expect(ARCH_SLOTS[i]!.kind).toBe("arc");
		for (const i of [8, 7, 4, 5]) expect(ARCH_SLOTS[i]!.kind).toBe("leg");
		// 8 is the first key down the left leg, 7 the second; the legs point down the page.
		const k8 = ARCH_SLOTS[8] as LegSlot;
		const k7 = ARCH_SLOTS[7] as LegSlot;
		expect(k8.t0).toBe(0);
		expect(k7.t0).toBe(k8.t1);
		expect(k8.vy).toBeCloseTo(1);
		expect(k8.vx).toBeCloseTo(0);
		expect((ARCH_SLOTS[4] as LegSlot).vy).toBeCloseTo(1);
		expect(k8.ux).toBeLessThan(0);
		expect((ARCH_SLOTS[4] as LegSlot).ux).toBeGreaterThan(0);
	});
	it("starts a leg on the end wedge's face and keeps it in the box", () => {
		// The end wedges are cut at the horizontal, and the first key's outer-top corner is the rim there.
		expect((ARCH_SLOTS[9] as ArcSlot).start).toBe(270);
		expect((ARCH_SLOTS[3] as ArcSlot).end).toBe(90);
		const d = slotPath(ARCH_SLOTS[8]!, R_MAJOR_IN, R_OUTER);
		const [x, y] = polarToCartesian(230, 270, 240, ARCH_CY);
		expect(d).toContain(`L${x.toFixed(2)},${y.toFixed(2)}`);
		expect(y).toBeCloseTo(ARCH_CY);
		const [, yBottom] = slotCenter(ARCH_SLOTS[7]!, R_OUTER);
		expect(yBottom).toBeLessThan(ARCH_HEIGHT);
	});
	it("turns the arch into a bowl, the key at the bottom and the legs rising", () => {
		const key = ARCH_DOWN_SLOTS[0] as ArcSlot;
		expect(key.start).toBe(165);
		expect(key.end).toBe(195);
		expect(key.cy).toBe(ARCH_HEIGHT - ARCH_CY);
		const [, yKey] = slotCenter(key, R_OUTER);
		const [, yEnd] = slotCenter(ARCH_DOWN_SLOTS[9]!, R_OUTER);
		expect(yKey).toBeGreaterThan(yEnd);
		const k8 = ARCH_DOWN_SLOTS[8] as LegSlot;
		const k7 = ARCH_DOWN_SLOTS[7] as LegSlot;
		expect(k8.vy).toBeCloseTo(-1);
		expect(slotCenter(k7, R_OUTER)[1]).toBeLessThan(slotCenter(k8, R_OUTER)[1]);
		expect(slotCenter(k7, R_OUTER)[1]).toBeGreaterThan(0);
		expect(ARCH_DOWN_SLOTS[6]).toBeNull();
	});
});
