import { describe, expect, it } from "vite-plus/test";
import { defaultRig, parseAmpPreferences } from "./ampPreferences";

describe("ampPreferences", () => {
	it("starts a guitar on the clean head and a bass on the fridge, each at the model's defaults", () => {
		const p = parseAmpPreferences({});
		expect(p.instrument).toBe("guitar");
		expect(p.guitar.model).toBe("clean");
		expect(p.bass.model).toBe("fridge");
		expect(p.trimDb).toEqual({ instrument: 12, line: 0 });
		expect(defaultRig("tweed").head.gain).toBe(0.55);
		expect(defaultRig("tweed").pedals.delay.analog).toBe(true);
	});
	it("fills in what an older save lacks and falls back to the defaults on nonsense", () => {
		const p = parseAmpPreferences({
			instrument: "bass",
			bass: { model: "solid", head: { gain: 0.9 } },
		});
		expect(p.bass.head.gain).toBe(0.9);
		expect(p.bass.head.midFreq).toBe(2);
		expect(p.bass.pedals.gate).toEqual({ on: false, threshold: -50 });
		expect(parseAmpPreferences({ instrument: "banjo" }).instrument).toBe("guitar");
		expect(parseAmpPreferences("x").guitar.model).toBe("clean");
	});
});
