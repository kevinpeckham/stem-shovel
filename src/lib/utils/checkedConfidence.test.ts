import { describe, expect, it } from "vite-plus/test";
import type { TimingMap } from "@barmark/sync";
import { checkedConfidence } from "./checkedConfidence";

const MAP = {
	format: "barmark-timing",
	version: 1,
	chart: { bars: 2, hash: "0000000000000000" },
	bars: [
		{ bar: 1, start: 0 },
		{ bar: 2, start: 2 },
	],
	end: 4,
} satisfies TimingMap;
const bars = (n: number) =>
	Array.from({ length: n }, (_, i) => ({ bar: i + 1, confidence: 1, slots: [1] }));
const record = (over: Record<string, unknown> = {}) => ({
	format: "barmark-confidence",
	version: 1,
	bars: bars(2),
	...over,
});

describe("checkedConfidence", () => {
	it("keeps a record of the builder's shape with a bar per played bar", () => {
		const r = record();
		expect(checkedConfidence(r, MAP)).toBe(r);
	});
	it("drops another bar count, another shape, or nothing", () => {
		expect(checkedConfidence(record({ bars: bars(3) }), MAP)).toBeNull();
		expect(checkedConfidence(record({ format: "other" }), MAP)).toBeNull();
		expect(checkedConfidence(record({ version: 2 }), MAP)).toBeNull();
		expect(checkedConfidence(record({ bars: "x" }), MAP)).toBeNull();
		expect(checkedConfidence(undefined, MAP)).toBeNull();
		expect(checkedConfidence("x", MAP)).toBeNull();
	});
});
