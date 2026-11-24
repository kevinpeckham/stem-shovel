import { describe, expect, it } from "vite-plus/test";
import { resizeExpressionPattern } from "./resizeExpressionPattern";
import { visibleExpressionPattern } from "./visibleExpressionPattern";
import type { ExpressionPattern } from "#lib/val/ExpressionDrumSchema.js";

const cell = (main: number) => ({ main, t1: 0, half: 0, t2: 0 });
const pattern = (meter: ExpressionPattern["meter"], steps: number): ExpressionPattern =>
	({
		meter,
		steps,
		rows: [
			{
				voice: "kick",
				level: 0.8,
				pan: 0,
				mute: false,
				delaySend: 0,
				reverbSend: 0,
				cells: Array.from({ length: steps }, (_, i) => cell((i % 5) + 1)),
			},
		],
	}) as ExpressionPattern;

describe("resizeExpressionPattern", () => {
	it("a shrink and its reverse give back the beat as composed", () => {
		const waltz = pattern("3/4", 24);
		const shrunk = resizeExpressionPattern({ ...waltz, meter: "4/4" }, 16);
		const back = resizeExpressionPattern({ ...shrunk, meter: "3/4" }, 24);
		expect(back.rows[0]!.cells).toEqual(waltz.rows[0]!.cells);
	});
	it("survives a round trip through JSON (a reload) between the two", () => {
		const waltz = pattern("3/4", 24);
		const saved = JSON.parse(JSON.stringify(resizeExpressionPattern(waltz, 12))) as ExpressionPattern;
		expect(resizeExpressionPattern(saved, 24).rows[0]!.cells).toEqual(waltz.rows[0]!.cells);
	});
	it("survives two shrinks in a row", () => {
		const four = pattern("4/4", 32);
		const back = resizeExpressionPattern(resizeExpressionPattern(resizeExpressionPattern(four, 16), 8), 32);
		expect(back.rows[0]!.cells).toEqual(four.rows[0]!.cells);
	});
	it("fills steps a row never had by repeating the visible cells", () => {
		const p = pattern("4/4", 8);
		const grown = resizeExpressionPattern(p, 16);
		expect(grown.rows[0]!.cells.slice(8)).toEqual(p.rows[0]!.cells);
	});
	it("shows and exports only the first `steps` cells", () => {
		const hidden = resizeExpressionPattern(pattern("4/4", 32), 16);
		expect(hidden.rows[0]!.cells).toHaveLength(32);
		expect(visibleExpressionPattern(hidden).rows[0]!.cells).toHaveLength(16);
	});
});
