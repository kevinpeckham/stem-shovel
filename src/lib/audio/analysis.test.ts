import { fakeAudioBuffer } from "../../../tests/helpers/fakeAudioBuffer";
import { describe, expect, test } from "vite-plus/test";
import {
	analyse,
	combineFeatures,
	combineKeySegments,
	detectKey,
	detectKeys,
	extractFeatures,
	extractKeySegments,
	fft,
} from "./analysis";

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

/**
 * Noise bursts at fractions of a beat: `hits` is one bar as [beat position, gain]
 * pairs (beats from the downbeat), repeated for `seconds`.
 */
function pattern(
	bpm: number,
	beatsPerBar: number,
	hits: [number, number][],
	seconds = 24,
): AudioBuffer {
	const data = new Float32Array(seconds * SR);
	const beat = (60 / bpm) * SR;
	let seed = 1;
	const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
	for (let bar = 0; bar * beatsPerBar * beat < data.length; bar++) {
		for (const [at, gain] of hits) {
			const start = Math.round((bar * beatsPerBar + at) * beat);
			for (let i = 0; i < 400 && start + i < data.length; i++) {
				data[start + i] += gain * rand() * (1 - i / 400);
			}
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

// The FFT passes take a few seconds each under coverage instrumentation (`bun run test:coverage`).
describe("tempo and meter", { timeout: 30_000 }, () => {
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
	test("a click track is far less tonal than a chord, and its chroma is weighted down", () => {
		const clicks = extractFeatures(clickTrack(120, 4));
		const keys = extractFeatures(chord([62, 66, 69, 74], 24)); // D major
		expect(clicks.tonal).toBeLessThan(keys.tonal * 0.5);
		const both = combineFeatures([clicks, keys])!;
		expect(detectKey(both.chroma, both.bassChroma).value).toBe("D major");
	});
	test("a three-feel riff over four-beat drums stays 4/4 (fleeing the capitol planet)", () => {
		// Hat and bass in four, a guitar riff in three, and a kick on every beat that says nothing.
		const parts = [
			extractFeatures(clickTrack(120, 4)),
			extractFeatures(clickTrack(120, 4)),
			extractFeatures(clickTrack(120, 3)),
			extractFeatures(clickTrack(120, 1)),
		];
		const d = analyse(combineFeatures(parts)!);
		expect(Math.abs(d.tempo.bpm - 120)).toBeLessThan(1.5);
		expect(d.meter.value).toBe("4/4");
	});
	test("two waltz stems and a flat kick are still a waltz", () => {
		const parts = [
			extractFeatures(clickTrack(96, 3)),
			extractFeatures(clickTrack(96, 3)),
			extractFeatures(clickTrack(96, 1)),
		];
		expect(analyse(combineFeatures(parts)!).meter.value).toBe("3/4");
	});
	test("stems add up: a quiet second stem does not change the answer", () => {
		const a = extractFeatures(clickTrack(140, 4));
		const b = extractFeatures(chord([60, 64, 67], 24));
		const d = analyse(combineFeatures([a, b])!);
		expect(Math.abs(d.tempo.bpm - 140)).toBeLessThan(1.5);
	});
});

describe("subdivision and the tempo ladder", { timeout: 30_000 }, () => {
	const rung = (d: ReturnType<typeof analyse>, factor: number) =>
		d.tempo.alternates.find((r) => r.factor === factor);
	test("straight 4/4 at 120 with eighths: subdivision 2, and 240 and 60 on the ladder", () => {
		// Accented downbeat, beats, softer off-beat eighths.
		const hits: [number, number][] = [0, 1, 2, 3].flatMap((b): [number, number][] => [
			[b, b === 0 ? 1 : 0.7],
			[b + 0.5, 0.5],
		]);
		const d = analyse(extractFeatures(pattern(120, 4, hits)));
		expect(Math.abs(d.tempo.bpm - 120)).toBeLessThan(1.5);
		expect(d.tempo.subdivision).toBe(2);
		expect(d.meter.value).toBe("4/4");
		expect(Math.abs(rung(d, 2)!.bpm - 240)).toBeLessThan(3);
		expect(Math.abs(rung(d, 0.5)!.bpm - 60)).toBeLessThan(1);
		expect(rung(d, 2)!.strength).toBeGreaterThan(0.5);
		expect(rung(d, 0.5)!.strength).toBeGreaterThan(0.5);
		const strengths = d.tempo.alternates.map((r) => r.strength);
		expect(strengths).toEqual([...strengths].sort((a, b) => b - a));
	});
	test("a 140 bpm waltz: subdivision 2, 3/4", () => {
		const d = analyse(extractFeatures(clickTrack(140, 3)));
		expect(Math.abs(d.tempo.bpm - 140)).toBeLessThan(1.5);
		expect(d.tempo.subdivision).toBe(2);
		expect(d.meter.value).toBe("3/4");
	});
	/** One bar of 6/8 in dotted beats (an eighth is a third), accented 3+3, the other eighths at `light`. */
	const sixEight = (light: number): [number, number][] =>
		[0, 1, 2, 3, 4, 5].map((e) => [e / 3, e === 0 ? 1 : e === 3 ? 0.8 : light]);
	test("6/8 at a dotted-quarter 80 with running eighths, the dotted beat found first: 80, compound", () => {
		// Light eighths: the autocorrelation peaks at three eighths (80) and the sub-beat test fires.
		const hits = sixEight(0.1);
		const d = analyse(extractFeatures(pattern(80, 2, hits)));
		expect(Math.abs(d.tempo.bpm - 80)).toBeLessThan(1.5);
		expect(d.tempo.subdivision).toBe(3);
		expect(d.meter.value).toBe("6/8");
		expect(Math.abs(rung(d, 1.5)!.bpm - 120)).toBeLessThan(3);
		// The eighths of the 6/8 at 80, three to the dotted beat.
		expect(Math.abs(rung(d, 3)!.bpm - 240)).toBeLessThan(3);
		expect(rung(d, 3)!.strength).toBeGreaterThan(0.5);
	});
	test("6/8 at 80 where the autocorrelation picks two eighths (120) first: re-picked to 80", () => {
		// Louder eighths: the bare peak sits at two eighths, 1.5× the dotted beat; the super-beat test re-picks.
		const hits = sixEight(0.2);
		const d = analyse(extractFeatures(pattern(80, 2, hits)));
		expect(Math.abs(d.tempo.bpm - 80)).toBeLessThan(1.5);
		expect(d.tempo.subdivision).toBe(3);
		expect(d.meter.value).toBe("6/8");
		expect(Math.abs(rung(d, 3)!.bpm - 240)).toBeLessThan(3);
		expect(rung(d, 3)!.strength).toBeGreaterThan(0.5);
	});
	test("swung 4/4 at 100 (off-beats at two thirds): subdivision 2, 4/4", () => {
		const hits: [number, number][] = [0, 1, 2, 3].flatMap((b): [number, number][] => [
			[b, b === 0 ? 1 : 0.7],
			[b + 2 / 3, 0.5],
		]);
		const d = analyse(extractFeatures(pattern(100, 4, hits)));
		expect(Math.abs(d.tempo.bpm - 100)).toBeLessThan(1.5);
		expect(d.tempo.subdivision).toBe(2);
		expect(d.meter.value).toBe("4/4");
	});
	test("silence: no tempo, no alternates", () => {
		const d = analyse(extractFeatures(fakeAudioBuffer([new Float32Array(10 * SR)], SR)));
		expect(d.tempo).toEqual({ bpm: 0, confidence: 0, subdivision: 2, alternates: [] });
		expect(d.meter.value).toBe("4/4");
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

describe("several keys", { timeout: 30_000 }, () => {
	/** Two chords one after the other in one buffer: C major for the first half, then E♭ major. */
	function twoChords(): AudioBuffer {
		const seconds = 12;
		const data = new Float32Array(seconds * SR);
		const half = (seconds / 2) * SR;
		const play = (midi: number[], from: number, to: number) => {
			for (const m of midi) {
				const f = 440 * 2 ** ((m - 69) / 12);
				for (let i = from; i < to; i++) data[i] += 0.2 * Math.sin((2 * Math.PI * f * i) / SR);
			}
		};
		play([60, 64, 67, 72, 76], 0, half);
		play([63, 67, 70, 75, 79], half, data.length);
		return fakeAudioBuffer([data], SR);
	}
	test("a key per section: C major then E♭ major, and one change when the halves are one section", () => {
		const segments = combineKeySegments([extractKeySegments(twoChords(), [0, 6])]);
		expect(segments.map((s) => s.start)).toEqual([0, 6]);
		const keys = detectKeys(segments);
		expect(keys.map((k) => [k.start, k.value])).toEqual([
			[0, "C major"],
			[6, "E♭ major"],
		]);
		// The same halves split into four: the repeated keys merge into the same two changes.
		expect(detectKeys(extractKeySegments(twoChords(), [0, 3, 6, 9])).map((k) => k.value)).toEqual([
			"C major",
			"E♭ major",
		]);
	});
});
