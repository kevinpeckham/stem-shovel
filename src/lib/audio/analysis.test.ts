import { fakeAudioBuffer } from "../../../tests/helpers/fakeAudioBuffer";
import { describe, expect, test } from "vite-plus/test";
import { analyse, combineFeatures, detectKey, extractFeatures, fft } from "./analysis";

const SR = 32_000;

/** Short noise bursts on every beat, louder on the first of each bar. */
function clickTrack(bpm: number, beatsPerBar: number, seconds = 24): AudioBuffer {
	const data = new Float32Array(seconds * SR);
	const beat = (60 / bpm) * SR;
	let seed = 1;
	const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
	for (let n = 0; n * beat < data.length; n++) {
		const start = Math.round(n * beat);
		const gain = n % beatsPerBar === 0 ? 1 : 0.35;
		for (let i = 0; i < 400 && start + i < data.length; i++) {
			data[start + i] += gain * rand() * (1 - i / 400);
		}
	}
	return fakeAudioBuffer([data], SR);
}

/** A sustained chord of sines. */
function chord(midi: number[], seconds = 6): AudioBuffer {
	const data = new Float32Array(seconds * SR);
	for (const m of midi) {
		const f = 440 * 2 ** ((m - 69) / 12);
		for (let i = 0; i < data.length; i++) data[i] += 0.2 * Math.sin((2 * Math.PI * f * i) / SR);
	}
	return fakeAudioBuffer([data], SR);
}

describe("fft", () => {
	test("finds a pure tone in the right bin", () => {
		const n = 1024;
		const re = new Float32Array(n);
		const im = new Float32Array(n);
		for (let i = 0; i < n; i++) re[i] = Math.sin((2 * Math.PI * 64 * i) / n);
		fft(re, im);
		let peak = 0;
		for (let b = 1; b < n / 2; b++)
			if (Math.hypot(re[b], im[b]) > Math.hypot(re[peak], im[peak])) peak = b;
		expect(peak).toBe(64);
	});
});

describe("tempo and meter", () => {
	test("a 120 bpm click track in four", () => {
		const d = analyse(extractFeatures(clickTrack(120, 4)));
		expect(Math.abs(d.tempo.bpm - 120)).toBeLessThan(1.5);
		expect(d.meter.value).toBe("4/4");
	});
	test("a 96 bpm waltz", () => {
		const d = analyse(extractFeatures(clickTrack(96, 3)));
		expect(Math.abs(d.tempo.bpm - 96)).toBeLessThan(1.5);
		expect(d.meter.value).toBe("3/4");
	});
	test("stems add up: a quiet second stem does not change the answer", () => {
		const a = extractFeatures(clickTrack(140, 4));
		const b = extractFeatures(chord([60, 64, 67], 24));
		const d = analyse(combineFeatures([a, b])!);
		expect(Math.abs(d.tempo.bpm - 140)).toBeLessThan(1.5);
	});
});

describe("key", () => {
	test("C major and A minor triads", () => {
		expect(detectKey(extractFeatures(chord([60, 64, 67, 72, 76])).chroma).value).toBe("C major");
		expect(detectKey(extractFeatures(chord([57, 60, 64, 69, 72])).chroma).value).toBe("A minor");
	});
	test("a D major scale", () => {
		expect(detectKey(extractFeatures(chord([62, 64, 66, 67, 69, 71, 73, 74])).chroma).value).toBe(
			"D major",
		);
	});
	test("silence is no key", () => {
		expect(detectKey(new Float32Array(12)).value).toBe("");
	});
});
