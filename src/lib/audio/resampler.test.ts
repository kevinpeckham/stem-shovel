import { describe, expect, it } from "vite-plus/test";
import { Resampler } from "./resampler";

const sine = (rate: number, from: number, len: number, hz = 1000) =>
	Float32Array.from({ length: len }, (_, k) => Math.sin((2 * Math.PI * hz * (from + k)) / rate));
const join = (parts: Float32Array[]) => {
	const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
};
/** A 1 kHz sine in windows of `win` frames through a resampler, joined; channel 1 is the sine at half level. */
function stream(from: number, to: number, total: number, win: number) {
	const r = new Resampler(from, to, 2);
	const parts: Float32Array[][] = [];
	for (let at = 0; at < total; at += win) {
		const s = sine(from, at, Math.min(win, total - at));
		parts.push(r.push([s, s.map((x) => x / 2)]));
	}
	parts.push(r.flush());
	return [0, 1].map((c) => join(parts.map((p) => p[c]!)));
}

describe("Resampler", () => {
	it("keeps a 1 kHz sine's frequency, amplitude and length from 48 kHz to 44.1 kHz", () => {
		const total = 48_000;
		const [left, right] = stream(48_000, 44_100, total, 12_000 + 7);
		expect(Math.abs(left!.length - (total * 44_100) / 48_000)).toBeLessThanOrEqual(1);
		// The middle, clear of the padded ends.
		const mid = left!.subarray(2000, 42_000);
		let crossings = 0;
		for (let k = 1; k < mid.length; k++) if (mid[k - 1]! < 0 !== mid[k]! < 0) crossings++;
		// 40000 frames at 44.1 kHz is 0.907 s: 907 cycles, two crossings each.
		expect(Math.abs(crossings - (2 * 1000 * mid.length) / 44_100)).toBeLessThanOrEqual(2);
		const peak = mid.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
		const rms = Math.sqrt(mid.reduce((s, x) => s + x * x, 0) / mid.length);
		expect(Math.abs(peak - 1)).toBeLessThan(0.01);
		expect(Math.abs(rms - Math.SQRT1_2)).toBeLessThan(0.01 * Math.SQRT1_2);
		expect(right![20_000]).toBeCloseTo(left![20_000]! / 2, 5);
		// Against the ideal sine at the output rate: the error stays far below the signal.
		let err = 0;
		for (let k = 2000; k < 42_000; k++)
			err = Math.max(err, Math.abs(left![k]! - Math.sin((2 * Math.PI * 1000 * k) / 44_100)));
		expect(err).toBeLessThan(0.005);
	});
	it("has no step at the window boundaries, whatever the window size", () => {
		for (const win of [1, 37, 128, 4410, 11_025]) {
			const [left] = stream(44_100, 48_000, 22_050, win);
			const mid = left!.subarray(100, left!.length - 100);
			let maxDiff = 0;
			for (let k = 1; k < mid.length; k++)
				maxDiff = Math.max(maxDiff, Math.abs(mid[k]! - mid[k - 1]!));
			// A 1 kHz full-scale sine at 48 kHz moves at most 2π·1000/48000 ≈ 0.131 a frame.
			expect(maxDiff).toBeLessThan(0.135);
			expect(Math.abs(left!.length - 24_000)).toBeLessThanOrEqual(1);
		}
	});
	it("comes out the same in windows as whole", () => {
		const [whole] = stream(48_000, 44_100, 9600, 9600);
		const [windows] = stream(48_000, 44_100, 9600, 300);
		expect(windows!.length).toBe(whole!.length);
		for (let k = 0; k < whole!.length; k++) expect(windows![k]).toBeCloseTo(whole![k]!, 6);
	});
	it("passes the input through when the rates match", () => {
		const r = new Resampler(48_000, 48_000, 1);
		const s = [sine(48_000, 0, 100)];
		expect(r.push(s)).toBe(s);
		expect(r.flush()[0]).toHaveLength(0);
	});
});
