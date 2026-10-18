import { MAX_AUTOMATION_POINTS } from "#lib/constants/studioAutomation.js";
import { describe, expect, it } from "vite-plus/test";
import { editAutomation } from "./editAutomation";

const range = { min: 0, max: 1.25 };

describe("editAutomation", () => {
	it("adds in time order, clamped to the range, never before zero", () => {
		let lane = editAutomation([], { kind: "add", t: 2, v: 0.5 }, range);
		expect(lane).toEqual({ points: [{ t: 2, v: 0.5 }], index: 0 });
		lane = editAutomation(lane.points, { kind: "add", t: 1, v: 2 }, range);
		expect(lane).toEqual({
			points: [
				{ t: 1, v: 1.25 },
				{ t: 2, v: 0.5 },
			],
			index: 0,
		});
		lane = editAutomation(lane.points, { kind: "add", t: -1, v: -3 }, range);
		expect(lane.points[0]).toEqual({ t: 0, v: 0 });
	});
	it("a point added on top of another replaces it", () => {
		const lane = editAutomation([{ t: 2, v: 0.5 }], { kind: "add", t: 2.01, v: 0.9 }, range);
		expect(lane.points).toEqual([{ t: 2.01, v: 0.9 }]);
	});
	it("moves a point and reports where it landed", () => {
		const points = [
			{ t: 1, v: 0 },
			{ t: 2, v: 0.5 },
			{ t: 3, v: 1 },
		];
		const lane = editAutomation(points, { kind: "move", index: 0, t: 2.5, v: 0.2 }, range);
		expect(lane.points.map((p) => p.t)).toEqual([2, 2.5, 3]);
		expect(lane.index).toBe(1);
		expect(lane.points[1]).toEqual({ t: 2.5, v: 0.2 });
	});
	it("removes and clears", () => {
		const points = [
			{ t: 1, v: 0 },
			{ t: 2, v: 0.5 },
		];
		expect(editAutomation(points, { kind: "remove", index: 0 }, range)).toEqual({
			points: [{ t: 2, v: 0.5 }],
			index: null,
		});
		expect(editAutomation(points, { kind: "clear" }, range)).toEqual({ points: [], index: null });
	});
	it("stops at the lane's cap", () => {
		const full = Array.from({ length: MAX_AUTOMATION_POINTS }, (_, i) => ({ t: i, v: 1 }));
		const lane = editAutomation(full, { kind: "add", t: 0.5, v: 0 }, range);
		expect(lane.points).toHaveLength(MAX_AUTOMATION_POINTS);
		expect(lane.index).toBeNull();
	});
	it("rounds to a tenth of a millisecond, as the arrangement stores times", () => {
		const lane = editAutomation([], { kind: "add", t: 1.00004, v: 0.333333 }, range);
		expect(lane.points[0]).toEqual({ t: 1, v: 0.3333 });
	});
});
