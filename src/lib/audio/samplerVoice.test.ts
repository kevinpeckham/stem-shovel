import { describe, expect, it, vi } from "vite-plus/test";
import { startSamplerVoice } from "./samplerVoice";

/** A stand-in context: nodes that record what they were told. */
function fakeContext() {
	const param = () => ({
		value: 1,
		setValueAtTime: vi.fn(),
		linearRampToValueAtTime: vi.fn(),
		cancelScheduledValues: vi.fn(),
	});
	const gain = { gain: param(), connect: vi.fn() };
	const source = {
		buffer: null as unknown,
		playbackRate: { value: 1 },
		loop: false,
		connect: vi.fn(),
		start: vi.fn(),
		stop: vi.fn(),
	};
	return {
		ctx: {
			createGain: () => gain,
			createBufferSource: () => source,
		} as unknown as BaseAudioContext,
		gain,
		source,
	};
}
const buffer = { duration: 1 } as AudioBuffer;
const out = {} as AudioNode;

describe("startSamplerVoice", () => {
	it("plays the recording at the rate that moves its root to the key, with the attack, into the output", () => {
		const { ctx, gain, source } = fakeContext();
		startSamplerVoice(
			ctx,
			out,
			buffer,
			{ root: 60, attack: 0.1, release: 0.2, loop: true },
			72,
			1,
			5,
		);
		expect(source.buffer).toBe(buffer);
		expect(source.playbackRate.value).toBeCloseTo(2, 6);
		expect(source.loop).toBe(true);
		expect(source.start).toHaveBeenCalledWith(5);
		expect(gain.connect).toHaveBeenCalledWith(out);
		expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0.0001, 5);
		expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(1, 5.1);
	});
	it("a softer touch is quieter; a semitone down is the twelfth root of two slower", () => {
		const { ctx, gain, source } = fakeContext();
		startSamplerVoice(
			ctx,
			out,
			buffer,
			{ root: 60, attack: 0, release: 0, loop: false },
			59,
			0.5,
			0,
		);
		expect(source.playbackRate.value).toBeCloseTo(2 ** (-1 / 12), 6);
		expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.15 + 0.85 * 0.25, 0.001);
	});
	it("the release ramps down over the release time and stops the source after it, once", () => {
		const { ctx, gain, source } = fakeContext();
		const voice = startSamplerVoice(
			ctx,
			out,
			buffer,
			{ root: 60, attack: 0, release: 0.5, loop: false },
			60,
			1,
			0,
		);
		voice.release(2);
		voice.release(3);
		expect(gain.gain.cancelScheduledValues).toHaveBeenCalledTimes(1);
		expect(gain.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.0001, 2.5);
		expect(source.stop).toHaveBeenCalledWith(2.51);
	});
});
