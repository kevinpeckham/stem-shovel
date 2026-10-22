import type { StudioClip } from "#lib/val/StudioSchema.js";
import { describe, expect, it } from "vite-plus/test";
import { mixClipsToChannels } from "./mixClipsToChannels";

const clip = (
	over: Partial<StudioClip> & { id: string; sourceId: string; start: number; duration: number },
): StudioClip => ({
	trackId: "t",
	offset: 0,
	gain: 1,
	fadeIn: 0,
	fadeOut: 0,
	name: "",
	...over,
});
const constant = (v: number, n: number) => new Float32Array(n).fill(v);

describe("mixClipsToChannels", () => {
	const sources = {
		a: { channels: [constant(0.5, 100)], sampleRate: 10 },
		b: { channels: [constant(0.2, 100), constant(0.4, 100)], sampleRate: 10 },
		// A second of 1 then silence: a loop over that second repeats it.
		c: { channels: [new Float32Array(100).map((_, i) => (i < 10 ? 1 : 0))], sampleRate: 10 },
	};
	const sourceOf = (id: string) =>
		(sources as Record<string, { channels: Float32Array[]; sampleRate: number }>)[id] ?? null;
	it("plays nothing of a switched-off clip", () => {
		const off = clip({ id: "m", sourceId: "a", start: 0, duration: 1, muted: true });
		const out = mixClipsToChannels([off], sourceOf, { from: 0, to: 1, sampleRate: 10 });
		expect(Array.from(out[0]!)).toEqual(Array.from({ length: 10 }, () => 0));
	});
	it("repeats a looped clip's loop, pass after pass, from where it starts", () => {
		const looped = clip({
			id: "l",
			sourceId: "c",
			start: 0,
			duration: 3,
			offset: 0.5,
			loop: { start: 0, end: 1 },
		});
		const out = mixClipsToChannels([looped], sourceOf, { from: 0, to: 3, sampleRate: 10 });
		expect(Array.from(out[0]!)).toEqual(Array.from({ length: 30 }, () => 1));
		const once = clip({ id: "o", sourceId: "c", start: 0, duration: 3 });
		const plain = mixClipsToChannels([once], sourceOf, { from: 0, to: 3, sampleRate: 10 });
		expect(Array.from(plain[0]!).slice(10)).toEqual(Array.from({ length: 20 }, () => 0));
	});
	it("lays each clip at its place from its offset with its gain; mono goes to both sides", () => {
		const out = mixClipsToChannels(
			[
				clip({ id: "1", sourceId: "a", start: 1, duration: 1, offset: 2, gain: 0.5 }),
				clip({ id: "2", sourceId: "b", start: 3, duration: 1 }),
			],
			sourceOf,
			{ from: 0, to: 5, sampleRate: 10 },
		);
		expect(out[0]).toHaveLength(50);
		expect(out[0]![5]).toBe(0);
		expect(out[0]![10]).toBeCloseTo(0.25, 6);
		expect(out[1]![10]).toBeCloseTo(0.25, 6);
		expect(out[0]![30]).toBeCloseTo(0.2, 6);
		expect(out[1]![30]).toBeCloseTo(0.4, 6);
		expect(out[0]![45]).toBe(0);
	});
	it("crossfades an overlap equal power so the level holds", () => {
		const out = mixClipsToChannels(
			[
				clip({ id: "1", sourceId: "a", start: 0, duration: 4 }),
				clip({ id: "2", sourceId: "a", start: 2, duration: 4 }),
			],
			sourceOf,
			{ from: 0, to: 6, sampleRate: 10 },
		);
		// In the overlap (2 s to 4 s) the two curves sum to more than either alone but never double: equal power peaks at √2 × 0.5.
		const mid = out[0]![30]!;
		expect(mid).toBeGreaterThan(0.5);
		expect(mid).toBeLessThan(0.5 * Math.SQRT2 + 0.01);
		expect(out[0]![10]).toBeCloseTo(0.5, 6);
		expect(out[0]![50]).toBeCloseTo(0.5, 6);
	});
	it("applies a clip's own linear fades and skips a source it cannot find", () => {
		const out = mixClipsToChannels(
			[
				clip({ id: "1", sourceId: "a", start: 0, duration: 2, fadeIn: 1 }),
				clip({ id: "2", sourceId: "zzz", start: 3, duration: 2 }),
			],
			sourceOf,
			{ from: 0, to: 5, sampleRate: 10 },
		);
		expect(out[0]![0]).toBe(0);
		expect(out[0]![5]).toBeCloseTo(0.25, 1);
		expect(out[0]![15]).toBeCloseTo(0.5, 6);
	});
});
