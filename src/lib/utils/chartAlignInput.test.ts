import { describe, expect, it } from "vite-plus/test";
import { parseChart } from "barmark";
import { barmarkChartBars } from "./barmarkChartBars";
import { chartAlignInput } from "./chartAlignInput";
import { chartDefaults } from "./chartDefaults";

/** What "Place from chart" hands @barmark/listen's `alignChart` besides the features. */
const song = (meter: string, bpm: number) => [
	{ kind: "tempo" as const, start: 0, value: String(bpm) },
	{ kind: "meter" as const, start: 0, value: meter },
];

describe("chartAlignInput", () => {
	it("carries the chart, the song's declared meter and tempo for the fit, and its start of bar 1", () => {
		const text = "time: 4/4, tempo: 120\n| C | G |\n";
		expect(chartAlignInput(text, song("4/4", 120), 0.5)).toEqual({
			chart: text,
			tempo: 120,
			declared: { meter: "4/4", tempo: 120 },
			startAt: 0.5,
		});
	});

	it("in 6/8 the song's 120 eighths are 40 dotted quarters, for the fit and for a chart that gives no tempo", () => {
		const text = "time: 6/8\n| C | G |\n";
		expect(chartAlignInput(text, song("6/8", 120), null)).toEqual({
			chart: text,
			tempo: 40,
			declared: { meter: "6/8", tempo: 40 },
			startAt: 0,
		});
	});

	it("a chart without `time:` is aligned in the song's meter, as the app reads it: a copy with the song's `time:` first", () => {
		const text = "## Verse\n| C | G |\n| [2/4] F | C |\n";
		const input = chartAlignInput(text, song("3/4", 90), null);
		expect(input).toEqual({
			chart: `time: 3/4\n${text}`,
			tempo: 90,
			declared: { meter: "3/4", tempo: 90 },
			startAt: 0,
		});
		// The copy plays the bars barmarkChartBars reads with the song's defaults, meter for meter.
		const copy = parseChart(input.chart).bars.map((b) => `${b.meter.n}/${b.meter.d}`);
		const app = barmarkChartBars(text, chartDefaults(song("3/4", 90)))!.bars.map((b) => b.meter);
		expect(copy).toEqual(app);
		expect(copy).toEqual(["3/4", "3/4", "2/4", "3/4"]);
		// In 6/8 the fallback is the song's 120 eighths as 40 dotted quarters.
		expect(chartAlignInput("| C | G |\n", song("6/8", 120), null)).toMatchObject({
			chart: "time: 6/8\n| C | G |\n",
			tempo: 40,
		});
	});

	it("the fallback tempo counts the chart's own time signature when it sets one; a chart in a song without a meter is left as it is", () => {
		expect(chartAlignInput("time: 12/8\n| C |\n", song("12/8", 96), null).tempo).toBe(32);
		expect(chartAlignInput("time: 4/4\n| C |\n", song("6/8", 120), null)).toMatchObject({
			chart: "time: 4/4\n| C |\n",
			tempo: 120,
		});
		expect(chartAlignInput("| C |\n", [song("4/4", 100)[0]!], null).chart).toBe("| C |\n");
	});

	it("a song without a tempo or a time signature declares nothing and gives no fallback; a start before 0:00 is 0:00", () => {
		expect(chartAlignInput("| C |\n", [], -0.2)).toEqual({ chart: "| C |\n", startAt: 0 });
		expect(chartAlignInput("| C |\n", [song("4/4", 100)[0]!], null)).toEqual({
			chart: "| C |\n",
			tempo: 100,
			startAt: 0,
		});
	});
});
