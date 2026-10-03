import { describe, expect, it } from "vite-plus/test";
import { polarToCartesian, segmentPath, wedgeCenter, wedgePath } from "./circleGeometry";

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
