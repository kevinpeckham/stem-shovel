import { describe, expect, it } from "vite-plus/test";
import { quantizeNotes } from "./quantizeNotes";

const n = (t: number, p = 60, d = 0.25) => ({ t, d, p, v: 0.8 });

describe("quantizeNotes", () => {
	it("moves each start to the nearest grid line on the timeline, keeping lengths", () => {
		// A clip at 1.0 s with offset 0: content time is timeline time less 1. Grid every 0.5 s from 0.
		expect(
			quantizeNotes([n(0.1), n(0.3, 64), n(0.74, 67, 1)], {
				origin: 0,
				step: 0.5,
				contentOrigin: 1,
			}),
		).toEqual([n(0), n(0.5, 64), n(0.5, 67, 1)]);
	});
	it("accounts for a clip's offset: the content origin is start minus offset", () => {
		// Clip starts at 2.0 with offset 0.3: content origin 1.7. A note at t=0.35 sits at 2.05 → 2.0 → t=0.3.
		expect(quantizeNotes([n(0.35)], { origin: 0, step: 0.5, contentOrigin: 1.7 })).toEqual([
			n(0.3),
		]);
	});
	it("never moves a note before the content origin", () => {
		// Timeline 0.8 rounds to the line at 0, before the clip's content begins at 0.7: it stays at zero.
		expect(quantizeNotes([n(0.1)], { origin: 0, step: 2, contentOrigin: 0.7 })).toEqual([n(0)]);
	});
	it("sorts by the new starts and leaves notes alone for a zero step", () => {
		expect(
			quantizeNotes([n(0.9, 60), n(0.6, 64)], { origin: 0, step: 0.5, contentOrigin: 0 }),
		).toEqual([n(0.5, 64), n(1, 60)]);
		expect(quantizeNotes([n(0.9), n(0.6)], { origin: 0, step: 0, contentOrigin: 0 })).toEqual([
			n(0.9),
			n(0.6),
		]);
	});
});
