import { describe, expect, it } from "vite-plus/test";
import { barmarkChartPlays } from "./barmarkChartPlays.js";

describe("barmarkChartPlays", () => {
	it("a chart with a bar plays, errors on other lines and all", () => {
		expect(barmarkChartPlays("key: F\n| F | C |")).toBe(true);
		expect(barmarkChartPlays("| Xq7 |\n| F |")).toBe(true);
	});
	it("the old measure lines, prose and an empty text do not", () => {
		expect(barmarkChartPlays("m1 key F major 4/4: F\nm2: C")).toBe(false);
		expect(barmarkChartPlays("Title: Song\nkey: F")).toBe(false);
		expect(barmarkChartPlays("")).toBe(false);
	});

	it("a bar whose chord barmark cannot read still plays, as unknown harmony (barmark 0.23)", () => {
		expect(barmarkChartPlays("| Xq7 |")).toBe(true);
	});
});
