import { describe, expect, it } from "vite-plus/test";
import { spreadPucks } from "./spreadPucks";

describe("spreadPucks", () => {
	it("leaves pucks apart where they are", () => {
		const out = spreadPucks([
			{ id: "a", x: 100, y: 100 },
			{ id: "b", x: 140, y: 100 },
		]);
		expect(out.get("a")).toEqual({ dx: 0, dy: 0, index: 0, count: 1 });
		expect(out.get("b")).toEqual({ dx: 0, dy: 0, index: 0, count: 1 });
	});
	it("spreads pucks on one spot into a ring, the first at the top, the count on each", () => {
		const out = spreadPucks([
			{ id: "a", x: 100, y: 100 },
			{ id: "b", x: 103, y: 99 },
			{ id: "c", x: 100, y: 100 },
		]);
		const a = out.get("a")!;
		const b = out.get("b")!;
		const c = out.get("c")!;
		expect([a.count, b.count, c.count]).toEqual([3, 3, 3]);
		expect([a.index, b.index, c.index]).toEqual([0, 1, 2]);
		expect(a).toMatchObject({ dx: 0, dy: -30 });
		for (const p of [a, b, c]) expect(Math.hypot(p.dx, p.dy)).toBeCloseTo(30, 1);
		expect(b.dx).toBeGreaterThan(0);
		expect(c.dx).toBeLessThan(0);
	});
	it("opens a second, wider ring past six", () => {
		const out = spreadPucks(Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, x: 0, y: 0 })));
		expect(Math.hypot(out.get("p5")!.dx, out.get("p5")!.dy)).toBeCloseTo(30, 1);
		expect(Math.hypot(out.get("p6")!.dx, out.get("p6")!.dy)).toBeCloseTo(60, 1);
		expect(out.get("p7")!.count).toBe(8);
	});
});
