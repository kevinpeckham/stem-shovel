import { describe, expect, it } from "vite-plus/test";
import { scheduleAutomation, type SchedulableParam } from "./scheduleAutomation";

function recorder() {
	const calls: [string, number, number][] = [];
	const param: SchedulableParam = {
		cancelScheduledValues: (t) => calls.push(["cancel", NaN, t]),
		setValueAtTime: (v, t) => calls.push(["set", v, t]),
		linearRampToValueAtTime: (v, t) => calls.push(["ramp", v, t]),
	};
	return { param, calls };
}

describe("scheduleAutomation", () => {
	const lane = [
		{ t: 1, v: 0 },
		{ t: 3, v: 1 },
		{ t: 5, v: 0.5 },
	];
	it("sets the value at the pass's start and ramps through the points inside the window", () => {
		const { param, calls } = recorder();
		const start = scheduleAutomation(param, lane, { from: 2, when: 10, to: null, fallback: 1 });
		expect(start).toBeCloseTo(0.5, 9);
		expect(calls[0]).toEqual(["cancel", NaN, 10]);
		expect(calls[1]![0]).toBe("set");
		expect(calls[1]![1]).toBeCloseTo(0.5, 9);
		expect(calls[1]![2]).toBe(10);
		expect(calls.slice(2)).toEqual([
			["ramp", 1, 11],
			["ramp", 0.5, 13],
		]);
	});
	it("stops at the pass's end and scales onto the param's units", () => {
		const { param, calls } = recorder();
		scheduleAutomation(param, lane, {
			from: 0,
			when: 5,
			to: 4,
			fallback: 0,
			scale: (v) => v * 0.5,
		});
		expect(calls).toEqual([
			["cancel", NaN, 5],
			["set", 0, 5],
			["ramp", 0, 6],
			["ramp", 0.5, 8],
		]);
	});
	it("an empty lane sets the fallback and nothing else", () => {
		const { param, calls } = recorder();
		expect(scheduleAutomation(param, [], { from: 2, when: 1, to: null, fallback: 0.8 })).toBe(0.8);
		expect(calls).toEqual([
			["cancel", NaN, 1],
			["set", 0.8, 1],
		]);
	});
});
