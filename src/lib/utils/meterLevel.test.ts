import { describe, expect, it } from "vite-plus/test";
import { METER_ZERO, meterWidth, nextMeter } from "./meterLevel";

describe("nextMeter", () => {
	it("rises at once, falls at a fixed rate, and holds the mark before letting it fall", () => {
		let m = nextMeter(METER_ZERO, 0.8, 0, 1 / 60);
		expect(m.level).toBe(0.8);
		expect(m.hold).toBe(0.8);
		m = nextMeter(m, 0.1, 0.25, 0.25);
		expect(m.level).toBeCloseTo(0.8 - 1.6 * 0.25);
		expect(m.hold).toBe(0.8);
		m = nextMeter(m, 0, 2, 0.5);
		expect(m.hold).toBeLessThan(0.8);
		expect(m.hold).toBeGreaterThanOrEqual(m.level);
	});
	it("takes a louder RMS at once and settles toward a quieter one", () => {
		let m = nextMeter(METER_ZERO, 0.5, 0, 1 / 60, 0.3);
		expect(m.rms).toBe(0.3);
		m = nextMeter(m, 0.5, 0.1, 0.1, 0.1);
		expect(m.rms).toBeGreaterThan(0.1);
		expect(m.rms).toBeLessThan(0.3);
		m = nextMeter(m, 0.5, 1, 1, 0.1);
		expect(m.rms).toBeCloseTo(0.1, 9);
		expect(nextMeter(METER_ZERO, 0.5, 0, 1 / 60).rms).toBe(0);
	});
	it("remembers a clip until reset", () => {
		let m = nextMeter(METER_ZERO, 1.02, 0, 1 / 60);
		expect(m.clipped).toBe(true);
		m = nextMeter(m, 0.2, 1, 1);
		expect(m.clipped).toBe(true);
		expect(nextMeter({ ...m, clipped: false }, 0.2, 2, 1).clipped).toBe(false);
	});
});

describe("meterWidth", () => {
	it("maps dB onto the bar: silence empty, unity full, −24 dB half way", () => {
		expect(meterWidth(0)).toBe(0);
		expect(meterWidth(1)).toBe(1);
		expect(meterWidth(10 ** (-24 / 20))).toBeCloseTo(0.5);
		expect(meterWidth(1.25)).toBe(1);
	});
});
