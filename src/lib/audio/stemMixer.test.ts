import { describe, expect, it } from "vite-plus/test";
// The worklet's mixing state, apart from its AudioWorkletProcessor shell (static/worklets/stem-mixer.js).
import { Mixer } from "../../../static/worklets/stem-mixer.js";

const RATE = 1000;
const chunk = (len: number, value: number, channels = 1) =>
	Array.from({ length: channels }, () => new Float32Array(len).fill(value));
const out = (frames = 128) => [new Float32Array(frames), new Float32Array(frames)];

describe("Mixer", () => {
	it("is silent until playing, buffers until every stem is primed, then mixes sample-locked", () => {
		const m = new Mixer(RATE);
		m.setStems(["a", "b"]);
		m.setGain("a", 1, true);
		m.setGain("b", 1, true);
		expect(m.mix(out(), 128)).toBe("silent");
		m.playing = true;
		m.push("a", 0, 0, chunk(2000, 0.5));
		expect(m.mix(out(), 128)).toBe("buffering");
		m.push("b", 0, 0, chunk(2000, 0.25));
		const o = out();
		expect(m.mix(o, 128)).toBe("mixed");
		expect(o[0]![0]).toBeCloseTo(0.75);
		expect(o[1]![127]).toBeCloseTo(0.75);
		expect(m.counter).toBe(128);
	});
	it("drops chunks of an old generation and clears the queues on a seek", () => {
		const m = new Mixer(RATE);
		m.setStems(["a"]);
		m.setGain("a", 1, true);
		m.playing = true;
		m.push("a", 0, 0, chunk(3000, 1));
		m.seek(500, 1);
		expect(m.counter).toBe(500);
		m.push("a", 0, 500, chunk(3000, 1)); // stale
		expect(m.mix(out(), 128)).toBe("buffering");
		m.push("a", 1, 500, chunk(3000, 1));
		expect(m.mix(out(), 128)).toBe("mixed");
	});
	it("pauses the counter when a stem runs dry and runs on when it is fed again", () => {
		const m = new Mixer(RATE);
		m.setStems(["a", "b"]);
		m.setGain("a", 1, true);
		m.setGain("b", 1, true);
		m.playing = true;
		m.push("a", 0, 0, chunk(1500, 1));
		m.push("b", 0, 0, chunk(5000, 1));
		for (let i = 0; i < 11; i++) expect(m.mix(out(), 128)).toBe("mixed");
		expect(m.counter).toBe(1408);
		expect(m.mix(out(), 128)).toBe("buffering");
		expect(m.counter).toBe(1408);
		m.push("a", 0, 1500, chunk(5000, 1));
		expect(m.mix(out(), 128)).toBe("mixed");
	});
	it("treats a stem that has ended as silence, and ends when every stem has", () => {
		const m = new Mixer(RATE);
		m.setStems(["a", "b"]);
		m.setGain("a", 1, true);
		m.setGain("b", 1, true);
		m.playing = true;
		m.push("a", 0, 0, chunk(256, 1));
		m.end("a", 0, 256);
		m.push("b", 0, 0, chunk(1024, 0.5));
		m.end("b", 0, 1024);
		const o = out();
		expect(m.mix(o, 128)).toBe("mixed");
		expect(o[0]![0]).toBeCloseTo(1.5);
		m.mix(out(), 128);
		const o3 = out();
		expect(m.mix(o3, 128)).toBe("mixed");
		expect(o3[0]![0]).toBeCloseTo(0.5);
		for (let i = 0; i < 5; i++) m.mix(out(), 128);
		expect(m.mix(out(), 128)).toBe("ended");
	});
	it("ramps a gain change over a few quanta and spreads a mono chunk to both channels", () => {
		const m = new Mixer(RATE);
		m.setStems(["a"]);
		m.setGain("a", 1, true);
		m.playing = true;
		m.push("a", 0, 0, chunk(5000, 1));
		m.mix(out(), 128);
		m.setGain("a", 0, false);
		const o = out();
		m.mix(o, 128);
		expect(o[0]![127]).toBeLessThan(1);
		expect(o[0]![127]).toBeGreaterThan(0);
		expect(o[1]![127]).toBeCloseTo(o[0]![127]);
		for (let i = 0; i < 40; i++) m.mix(out(), 128);
		const quiet = out();
		m.mix(quiet, 128);
		expect(Math.abs(quiet[0]![0])).toBeLessThan(1e-3);
	});
	it("keeps a second behind the counter and trims the rest", () => {
		const m = new Mixer(RATE);
		m.setStems(["a"]);
		m.setGain("a", 1, true);
		m.playing = true;
		for (let i = 0; i < 40; i++) m.push("a", 0, i * 128, chunk(128, 1));
		for (let i = 0; i < 20; i++) m.mix(out(), 128);
		expect(m.stems.get("a")!.queue[0]!.start).toBe(2560 - 1000 - ((2560 - 1000) % 128));
	});
});
