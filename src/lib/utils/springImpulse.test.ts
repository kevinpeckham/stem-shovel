import { describe, expect, it } from "vite-plus/test";
import { springImpulseSamples } from "./springImpulse";

describe("springImpulseSamples", () => {
	it("is a train of echoes that dies away, at unit energy, the same on every render", () => {
		const [l, r] = springImpulseSamples(48000, 1);
		expect(l.length).toBe(48000);
		let energy = 0;
		for (const x of l) energy += x * x;
		expect(energy).toBeCloseTo(1, 5);
		const rms = (from: number, to: number) => {
			let sum = 0;
			for (let i = from; i < to; i++) sum += l[i]! * l[i]!;
			return Math.sqrt(sum / (to - from));
		};
		expect(rms(0, 12000)).toBeGreaterThan(rms(36000, 48000) * 3);
		expect(Array.from(springImpulseSamples(48000, 1)[0].slice(0, 2000))).toEqual(
			Array.from(l.slice(0, 2000)),
		);
		// The channels differ (their own jitter) but carry the same energy.
		expect(Array.from(r.slice(1000, 1100))).not.toEqual(Array.from(l.slice(1000, 1100)));
	});
});
