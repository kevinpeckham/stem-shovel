import { describe, expect, it } from "vite-plus/test";
// The fill's state, apart from its AudioWorkletProcessor shell (static/worklets/stereo-fill.js).
import { StereoFill } from "../../../static/worklets/stereo-fill.js";

const N = 128;
const out = () => [new Float32Array(N), new Float32Array(N)];
const ramp = (from: number) => Float32Array.from({ length: N }, (_, k) => from + k + 1);

describe("StereoFill", () => {
	it("copies a one-channel input to both channels", () => {
		const fill = new StereoFill();
		const o = out();
		fill.render([ramp(0)], o, N);
		expect(o[0]).toEqual(ramp(0));
		expect(o[1]).toEqual(ramp(0));
	});
	it("copies the left into a right channel that is digital silence", () => {
		const fill = new StereoFill();
		const o = out();
		fill.render([ramp(0), new Float32Array(N)], o, N);
		expect(o[1]).toEqual(ramp(0));
	});
	it("passes a stereo input once the right channel has carried a sample, and stays open", () => {
		const fill = new StereoFill();
		const a = out();
		fill.render([ramp(0), new Float32Array(N)], a, N);
		expect(a[1]).toEqual(ramp(0));
		const right = new Float32Array(N);
		right[40] = 1e-6;
		const b = out();
		fill.render([ramp(0), right], b, N);
		expect(b[1]).toEqual(right);
		const c = out();
		fill.render([ramp(0), new Float32Array(N)], c, N);
		expect(c[0]).toEqual(ramp(0));
		expect(c[1].every((x) => x === 0)).toBe(true);
	});
	it("is silent with nothing connected", () => {
		const fill = new StereoFill();
		const o = out();
		o[0].fill(0.5);
		fill.render([], o, N);
		expect(o[0].every((x) => x === 0)).toBe(true);
		expect(o[1].every((x) => x === 0)).toBe(true);
	});
});
