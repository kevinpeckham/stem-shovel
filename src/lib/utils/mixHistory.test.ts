import { describe, expect, it } from "vite-plus/test";
import { MixHistory } from "./mixHistory";

describe("MixHistory", () => {
	it("keeps one step per gesture: a stream of changes closer than the gap is one", () => {
		const h = new MixHistory<number>(400);
		let v = 0;
		const current = () => v;
		expect(h.remember(current, 1000)).toBe(true);
		v = 1;
		expect(h.remember(current, 1016)).toBe(false);
		v = 2;
		expect(h.remember(current, 1300)).toBe(false);
		v = 3;
		// A pause: the next change starts a new gesture.
		expect(h.remember(current, 2000)).toBe(true);
		v = 4;
		expect(h.canUndo).toBe(true);
		expect(h.undo(current)).toBe(3);
		v = 3;
		expect(h.undo(current)).toBe(0);
		v = 0;
		expect(h.undo(current)).toBeNull();
		expect(h.canRedo).toBe(true);
		expect(h.redo(current)).toBe(3);
		v = 3;
		expect(h.redo(current)).toBe(4);
		expect(h.redo(current)).toBeNull();
	});

	it("a new change after an undo drops the redo stack and starts a fresh step at once", () => {
		const h = new MixHistory<number>(400);
		let v = 0;
		const current = () => v;
		h.remember(current, 0);
		v = 1;
		expect(h.undo(current)).toBe(0);
		v = 0;
		// Right after an undo, a change is a new gesture whatever the clock says.
		expect(h.remember(current, 1)).toBe(true);
		expect(h.canRedo).toBe(false);
	});

	it("is bounded and clears", () => {
		const h = new MixHistory<number>(0, 3);
		let v = 0;
		for (let i = 0; i < 5; i++) {
			h.remember(() => v, i * 10);
			v = i + 1;
		}
		expect(h.undo(() => v)).toBe(4);
		expect(h.undo(() => v)).toBe(3);
		expect(h.undo(() => v)).toBe(2);
		expect(h.undo(() => v)).toBeNull();
		h.remember(() => v, 100);
		h.clear();
		expect(h.canUndo).toBe(false);
	});
});
