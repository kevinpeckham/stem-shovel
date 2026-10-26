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
const filters = (nodes: FakeNode[]) =>
	Object.fromEntries(nodes.filter((n) => n.kind === "biquad").map((n) => [n.type, n]));

describe("createPlaybackEq", () => {
	it("builds a high-pass, low shelf, mid peak and high shelf at their frequencies", () => {
		const { ctx, nodes } = fakeContext();
		const eq = createPlaybackEq(ctx);
		const f = filters(nodes);
		expect(f.highpass?.frequency?.value).toBe(80);
		expect(f.highpass?.Q?.value).toBeCloseTo(0.707);
		expect(f.lowshelf?.frequency?.value).toBe(200);
		expect(f.peaking?.frequency?.value).toBe(1000);
		expect(f.peaking?.Q?.value).toBe(1);
		expect(f.highshelf?.frequency?.value).toBe(4000);
		expect(eq.output).toBe(f.highshelf);
		const input = eq.input as unknown as FakeNode;
		expect(reaches(input, f.highpass!)).toBe(true);
		expect(reaches(input, f.highshelf!)).toBe(true);
		expect(reaches(f.lowshelf!, f.peaking!) && reaches(f.peaking!, f.highshelf!)).toBe(true);
	});

	it("starts with the high-pass bypassed and the bands flat", () => {
		const { ctx, nodes } = fakeContext();
		createPlaybackEq(ctx);
		const f = filters(nodes);
		const through = f.highpass!.targets[0]!;
		const around = nodes.find(
			(n) => n.kind === "gain" && n !== through && n.targets[0] === f.lowshelf,
		)!;
		expect(through.gain?.value).toBe(0);
		expect(around.gain?.value).toBe(1);
		expect([f.lowshelf, f.peaking, f.highshelf].map((n) => n!.gain!.value)).toEqual([0, 0, 0]);
	});

	it("update applies the dB gains and switches the high-pass in and out", () => {
		const { ctx, nodes } = fakeContext();
		const eq = createPlaybackEq(ctx);
		const f = filters(nodes);
		const through = f.highpass!.targets[0]!;
		const around = nodes.find(
			(n) => n.kind === "gain" && n !== through && n.targets[0] === f.lowshelf,
		)!;
		eq.update({ highPass: true, low: 3.5, mid: -6, high: 12 });
		expect(f.lowshelf!.gain!.value).toBe(3.5);
		expect(f.peaking!.gain!.value).toBe(-6);
		expect(f.highshelf!.gain!.value).toBe(12);
		expect(through.gain!.value).toBe(1);
		expect(around.gain!.value).toBe(0);
		eq.update({ ...DEFAULT_PLAYBACK_EQ });
		expect(through.gain!.value).toBe(0);
		expect(around.gain!.value).toBe(1);
		expect(f.lowshelf!.gain!.value).toBe(0);
	});
});

describe("isFlat", () => {
	it("is true only at the defaults", () => {
		expect(isFlat(DEFAULT_PLAYBACK_EQ)).toBe(true);
		expect(isFlat({ ...DEFAULT_PLAYBACK_EQ, highPass: true })).toBe(false);
		expect(isFlat({ ...DEFAULT_PLAYBACK_EQ, low: 0.5 })).toBe(false);
		expect(isFlat({ ...DEFAULT_PLAYBACK_EQ, mid: -0.5 })).toBe(false);
		expect(isFlat({ ...DEFAULT_PLAYBACK_EQ, high: 12 })).toBe(false);
	});
});
