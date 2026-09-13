import { describe, expect, test } from "vite-plus/test";
import { parseBarsText } from "./parseBarsText";

describe("parseBarsText", () => {
	test("bar|beat with an optional fraction of the beat", () => {
		expect(parseBarsText("12|3")).toEqual({ bar: 12, beat: 3, fraction: 0 });
		expect(parseBarsText("12|3|0.5")).toEqual({ bar: 12, beat: 3, fraction: 0.5 });
		expect(parseBarsText("-1|4")).toEqual({ bar: -1, beat: 4, fraction: 0 });
	});
	test("rejects beat 0, a full-beat fraction and non-bars", () => {
		expect(parseBarsText("12|0")).toBeNull();
		expect(parseBarsText("12|3|1")).toBeNull();
		expect(parseBarsText("12.3")).toBeNull();
		expect(parseBarsText("1:23")).toBeNull();
	});
});
