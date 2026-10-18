import { describe, expect, it } from "vite-plus/test";
import { createInsertChain } from "./insertChain";

/**
 * The chain over a stand-in context: every node records what it connects
 * to, so the test reads the wiring as a list of edges. The stages come
 * from mixStages.ts on the same stand-in (gains, filters and the rest are
 * all plain nodes here).
 */
interface FakeNode {
	name: string;
	targets: FakeNode[];
	connect(to: FakeNode): FakeNode;
	disconnect(): void;
	[k: string]: unknown;
}
function fakeContext() {
	let n = 0;
	const param = () => ({
		value: 0,
		setTargetAtTime() {},
		setValueAtTime() {},
		cancelScheduledValues() {},
		linearRampToValueAtTime() {},
	});
	const node = (kind: string, extra: Record<string, unknown> = {}): FakeNode => {
		const self: FakeNode = {
			name: `${kind}${++n}`,
			targets: [],
			connect(to) {
				self.targets.push(to);
				return to;
			},
			disconnect() {
				self.targets = [];
			},
			...extra,
		};
		return self;
	};
	return {
		currentTime: 0,
		sampleRate: 48000,
		createGain: () => node("gain", { gain: param() }),
		createBiquadFilter: () => node("biquad", { frequency: param(), gain: param(), Q: param() }),
		createDelay: () => node("delay", { delayTime: param() }),
		createWaveShaper: () => node("shaper"),
		createConvolver: () => node("convolver"),
		createDynamicsCompressor: () =>
			node("comp", {
				threshold: param(),
				knee: param(),
				ratio: param(),
				attack: param(),
				release: param(),
			}),
		createBuffer: () => ({ getChannelData: () => new Float32Array(8) }),
		createStereoPanner: () => node("panner", { pan: param() }),
		createAnalyser: () => node("analyser"),
		createOscillator: () => node("osc", { frequency: param(), start() {}, stop() {} }),
	} as unknown as BaseAudioContext;
}
/** Whether a path of connections leads from one node to another. */
function reaches(from: FakeNode, to: FakeNode, seen = new Set<FakeNode>()): boolean {
	if (from === to) return true;
	if (seen.has(from)) return false;
	seen.add(from);
	return from.targets.some((t) => reaches(t, to, seen));
}

describe("createInsertChain", () => {
	it("connects the input straight to the output with no inserts", () => {
		const chain = createInsertChain(fakeContext(), []);
		const input = chain.input as unknown as FakeNode;
		expect(input.targets).toEqual([chain.output]);
	});
	it("runs the signal through the inserts in order, round a bypassed one, and keeps a stage across a settings change", () => {
		const ctx = fakeContext();
		const eq = { id: "a", kind: "eq" as const, settings: { lowGain: 0 } };
		const delay = { id: "b", kind: "delay" as const, settings: { time: 0.3 } };
		const chain = createInsertChain(ctx, [eq, delay]);
		const input = chain.input as unknown as FakeNode;
		const output = chain.output as unknown as FakeNode;
		expect(reaches(input, output)).toBe(true);
		const eqParams = chain.params("a")!;
		expect(Object.keys(eqParams)).toContain("lowGain");
		expect(chain.params("b")).not.toBeNull();
		expect(chain.params("zzz")).toBeNull();
		// A settings change keeps the same stage (its params are the same objects).
		chain.update([{ ...eq, settings: { lowGain: 3 } }, delay], 0.02);
		expect(chain.params("a")!.lowGain).toBe(eqParams.lowGain);
		// Bypassing the EQ: the input no longer feeds it, the signal still reaches the output.
		chain.update([{ ...eq, bypass: true }, delay], 0);
		const eqInput = (chain as unknown as { input: FakeNode }).input;
		expect(eqInput.targets.some((t) => t.name.startsWith("gain") && t !== output)).toBe(true);
		expect(reaches(input, output)).toBe(true);
		// Removing every insert goes back to input → output.
		chain.update([], 0);
		expect(input.targets).toEqual([output]);
		expect(chain.params("a")).toBeNull();
		chain.dispose();
		expect(input.targets).toEqual([]);
	});
	it("swaps the stage when an insert's kind changes under the same id", () => {
		const chain = createInsertChain(fakeContext(), [{ id: "x", kind: "reverb", settings: {} }]);
		const before = chain.params("x");
		chain.update([{ id: "x", kind: "limiter", settings: {} }], 0);
		expect(chain.params("x")).not.toBe(before);
	});
});
