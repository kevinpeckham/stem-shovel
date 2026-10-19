import { describe, expect, it } from "vite-plus/test";
import { resampleChannels, semitonesFactor } from "./resampleChannels";
import { stretchChannels } from "./stretchChannels";

const sine = (hz: number, seconds: number, sampleRate: number, amp = 0.5) => {
	const out = new Float32Array(Math.round(seconds * sampleRate));
	for (let i = 0; i < out.length; i++) out[i] = amp * Math.sin((2 * Math.PI * hz * i) / sampleRate);
	return out;
};
/** The dominant frequency by zero crossings per second over the middle of the signal. */
const pitchOf = (x: Float32Array, sampleRate: number) => {
	const a = Math.floor(x.length * 0.25);
	const b = Math.floor(x.length * 0.75);
	let crossings = 0;
	for (let i = a + 1; i < b; i++) if (x[i - 1]! < 0 !== x[i]! < 0) crossings++;
	return (crossings / 2) * (sampleRate / (b - a));
};
const rms = (x: Float32Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);

describe("stretchChannels", () => {
	const sampleRate = 22050;
	it("makes the audio longer or shorter at the same pitch and level", () => {
		const tone = sine(220, 2, sampleRate);
		for (const ratio of [1.5, 0.75]) {
			const [out] = stretchChannels([tone], ratio, sampleRate);
			expect(out!.length).toBe(Math.round(tone.length * ratio));
			expect(pitchOf(out!, sampleRate)).toBeCloseTo(220, -1);
			expect(rms(out!)).toBeCloseTo(rms(tone), 1);
		}
	});
	it("is a copy at ratio 1 and keeps the channels together", () => {
		const left = sine(220, 1, sampleRate);
		const right = sine(330, 1, sampleRate);
		const same = stretchChannels([left, right], 1, sampleRate);
		expect(same[0]).not.toBe(left);
		expect([...same[0]!.subarray(0, 5)]).toEqual([...left.subarray(0, 5)]);
		const [l, r] = stretchChannels([left, right], 1.3, sampleRate);
		expect(l!.length).toBe(r!.length);
		expect(pitchOf(l!, sampleRate)).toBeCloseTo(220, -1);
		expect(pitchOf(r!, sampleRate)).toBeCloseTo(330, -1);
	});
	it("resamples for pitch: an octave up halves the length and doubles the pitch; stretched back it keeps the length", () => {
		const tone = sine(220, 1, sampleRate);
		const [up] = resampleChannels([tone], semitonesFactor(12));
		expect(up!.length).toBe(Math.round(tone.length / 2));
		expect(pitchOf(up!, sampleRate)).toBeCloseTo(440, -1);
		const [shifted] = stretchChannels([up!], 2, sampleRate);
		expect(shifted!.length).toBe(tone.length);
		expect(pitchOf(shifted!, sampleRate)).toBeCloseTo(440, -1);
		expect(semitonesFactor(0)).toBe(1);
		expect(semitonesFactor(-12)).toBe(0.5);
	});
});
