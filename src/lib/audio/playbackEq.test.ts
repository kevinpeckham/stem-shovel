import { describe, expect, it } from "vite-plus/test";
import { createPlaybackEq, DEFAULT_PLAYBACK_EQ, isFlat } from "./playbackEq";

/**
 * The EQ over a stand-in context (insertChain.test.ts's pattern): every node
 * records what it connects to, and every param records its target values.
 */
interface FakeParam {
	value: number;
	targets: number[];
	setTargetAtTime(v: number): void;
}
interface FakeNode {
	kind: string;
	type?: string;
	targets: FakeNode[];
	connect(to: FakeNode): FakeNode;
	frequency?: FakeParam;
	gain?: FakeParam;
	Q?: FakeParam;
}
function fakeContext() {
	const nodes: FakeNode[] = [];
	const param = (value = 0): FakeParam => {
		const p: FakeParam = {
			value,
			targets: [],
			setTargetAtTime(v) {
				p.targets.push(v);
				p.value = v;
			},
		};
		return p;
	};
	const node = (kind: string, extra: Partial<FakeNode> = {}): FakeNode => {
		const self: FakeNode = {
			kind,
			targets: [],
			connect(to) {
				self.targets.push(to);
				return to;
			},
			...extra,
		};
		nodes.push(self);
		return self;
	};
	const ctx = {
		currentTime: 0,
		createGain: () => node("gain", { gain: param(1) }),
		createBiquadFilter: () => node("biquad", { frequency: param(), gain: param(), Q: param() }),
	} as unknown as BaseAudioContext;
	return { ctx, nodes };
}
function reaches(from: FakeNode, to: FakeNode, seen = new Set<FakeNode>()): boolean {
	if (from === to) return true;
	if (seen.has(from)) return false;
	seen.add(from);
	return from.targets.some((t) => reaches(t, to, seen));
}
/** The biquads in creation order: high-pass, then the five bands (low, lowMid, mid, highMid, high). */
const filters = (nodes: FakeNode[]) => {
	const [highpass, low, lowMid, mid, highMid, high] = nodes.filter((n) => n.kind === "biquad");
	return { highpass, low, lowMid, mid, highMid, high };
};

describe("createPlaybackEq", () => {
	it("builds a high-pass and five bands at their default centers, shelves outside and Q 1 peaks between", () => {
		const { ctx, nodes } = fakeContext();
		const eq = createPlaybackEq(ctx);
		const f = filters(nodes);
		expect(f.highpass.type).toBe("highpass");
		expect(f.highpass.frequency?.value).toBe(80);
		expect(f.highpass.Q?.value).toBeCloseTo(0.707);
		expect([f.low.type, f.lowMid.type, f.mid.type, f.highMid.type, f.high.type]).toEqual([
			"lowshelf",
			"peaking",
			"peaking",
			"peaking",
			"highshelf",
		]);
		expect([f.low, f.lowMid, f.mid, f.highMid, f.high].map((n) => n.frequency?.value)).toEqual([
			200, 400, 1000, 2500, 4000,
		]);
		expect(f.mid.Q?.value).toBe(1);
		const trim = nodes.filter((n) => n.kind === "gain").at(-1)!;
		expect(eq.output).toBe(trim);
		expect(reaches(f.high, trim)).toBe(true);
		const input = eq.input as unknown as FakeNode;
		expect(reaches(input, f.highpass)).toBe(true);
		expect(reaches(input, f.high)).toBe(true);
		expect(reaches(f.low, f.lowMid) && reaches(f.lowMid, f.mid) && reaches(f.highMid, f.high)).toBe(
			true,
		);
	});

	it("starts with the high-pass bypassed and the bands flat", () => {
		const { ctx, nodes } = fakeContext();
		createPlaybackEq(ctx);
		const f = filters(nodes);
		const gains = nodes.filter((n) => n.kind === "gain");
		// input, through, around, trim: the through gain is 0 and the around gain 1 with the high-pass
		// off; nothing boosted, so the trim is unity.
		expect(gains.map((g) => g.gain?.value)).toEqual([1, 0, 1, 1]);
		expect([f.low, f.lowMid, f.mid, f.highMid, f.high].map((n) => n.gain?.value)).toEqual([
			0, 0, 0, 0, 0,
		]);
	});

	it("update glides the gains and centers and switches the high-pass in and out", () => {
		const { ctx, nodes } = fakeContext();
		const eq = createPlaybackEq(ctx);
		const f = filters(nodes);
		eq.update({
			...DEFAULT_PLAYBACK_EQ,
			highPass: true,
			low: { gain: 4, freq: 150 },
			mid: { gain: -3, freq: 1500 },
			high: { gain: 2, freq: 6000 },
		});
		const [, through, around] = nodes.filter((n) => n.kind === "gain");
		expect(through.gain?.targets).toEqual([1]);
		expect(around.gain?.targets).toEqual([0]);
		expect(f.low.gain?.targets).toEqual([4]);
		expect(f.low.frequency?.targets).toEqual([150]);
		expect(f.mid.gain?.targets).toEqual([-3]);
		expect(f.mid.frequency?.targets).toEqual([1500]);
		expect(f.high.gain?.targets).toEqual([2]);
		expect(f.high.frequency?.targets).toEqual([6000]);
		eq.update(DEFAULT_PLAYBACK_EQ);
		expect(through.gain?.value).toBe(0);
		expect(around.gain?.value).toBe(1);
		expect(f.mid.frequency?.value).toBe(1000);
	});

	it("trims the output by the largest boost, so boosting never raises the peak", () => {
		const { ctx, nodes } = fakeContext();
		const eq = createPlaybackEq(ctx, { ...DEFAULT_PLAYBACK_EQ, low: { gain: 6, freq: 200 } });
		const trim = nodes.filter((n) => n.kind === "gain").at(-1)!;
		expect(trim.gain?.value).toBeCloseTo(10 ** (-6 / 20));
		eq.update({ ...DEFAULT_PLAYBACK_EQ, mid: { gain: -4, freq: 1000 } });
		expect(trim.gain?.targets).toEqual([1]);
		eq.update({
			...DEFAULT_PLAYBACK_EQ,
			low: { gain: 2, freq: 200 },
			high: { gain: 3, freq: 4000 },
		});
		expect(trim.gain?.value).toBeCloseTo(10 ** (-3 / 20));
	});
});

describe("isFlat", () => {
	it("is true when nothing is audible: the high-pass off and every gain 0", () => {
		expect(isFlat(DEFAULT_PLAYBACK_EQ)).toBe(true);
		expect(isFlat({ ...DEFAULT_PLAYBACK_EQ, mid: { gain: 0, freq: 2000 } })).toBe(true);
		expect(isFlat({ ...DEFAULT_PLAYBACK_EQ, highPass: true })).toBe(false);
		expect(isFlat({ ...DEFAULT_PLAYBACK_EQ, high: { gain: 1, freq: 4000 } })).toBe(false);
	});
});
