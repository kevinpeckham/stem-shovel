import { describe, expect, test } from "vite-plus/test";
import { applyLocalMix, snapshotLocalMix } from "./localMix";

function fakeEngine(
	stems: { id: string; gain: number; pan?: number; muted?: boolean; soloed?: boolean }[],
) {
	const e = {
		master: 1,
		stems: stems.map((s) => ({
			id: s.id,
			gain: s.gain,
			pan: s.pan ?? 0,
			muted: !!s.muted,
			soloed: !!s.soloed,
		})),
		setGain(id: string, v: number) {
			const s = e.stems.find((x) => x.id === id);
			if (s) s.gain = v;
		},
		setPan(id: string, v: number) {
			const s = e.stems.find((x) => x.id === id);
			if (s) s.pan = v;
		},
		toggleMute(id: string) {
			const s = e.stems.find((x) => x.id === id);
			if (s) s.muted = !s.muted;
		},
		toggleSolo(id: string) {
			const s = e.stems.find((x) => x.id === id);
			if (s) s.soloed = !s.soloed;
		},
		setMaster(v: number) {
			e.master = v;
		},
	};
	return e;
}
const defaults = new Map([
	["a", 1],
	["b", 0.6],
]);

describe("snapshotLocalMix", () => {
	test("null when everything sits at the default mix", () => {
		expect(
			snapshotLocalMix(
				fakeEngine([
					{ id: "a", gain: 1 },
					{ id: "b", gain: 0.6 },
				]),
				defaults,
			),
		).toBeNull();
	});
	test("records only what differs", () => {
		const e = fakeEngine([
			{ id: "a", gain: 0.4 },
			{ id: "b", gain: 0.6, muted: true },
		]);
		expect(snapshotLocalMix(e, defaults)).toEqual({
			gains: { a: 0.4 },
			muted: ["b"],
			soloed: [],
			master: 1,
		});
	});
});

describe("applyLocalMix", () => {
	test("puts a saved mix on the engine and null restores the defaults", () => {
		const e = fakeEngine([
			{ id: "a", gain: 1 },
			{ id: "b", gain: 0.6 },
		]);
		applyLocalMix(e, { gains: { a: 0.3 }, muted: ["b"], soloed: [], master: 0.8 }, defaults);
		expect(e.stems.map((s) => [s.gain, s.muted])).toEqual([
			[0.3, false],
			[0.6, true],
		]);
		expect(e.master).toBe(0.8);
		applyLocalMix(e, null, defaults);
		expect(e.stems.map((s) => [s.gain, s.muted])).toEqual([
			[1, false],
			[0.6, false],
		]);
		expect(e.master).toBe(1);
	});

	test("a pan away from the default is kept, and applied back; a save without pans still applies", () => {
		const e = fakeEngine([
			{ id: "a", gain: 1, pan: -0.5 },
			{ id: "b", gain: 0.6 },
		]);
		const snap = snapshotLocalMix(e, defaults);
		expect(snap?.pans).toEqual({ a: -0.5 });
		expect(snap?.gains).toEqual({});
		applyLocalMix(e, null, defaults);
		expect(e.stems[0]!.pan).toBe(0);
		applyLocalMix(e, snap, defaults);
		expect(e.stems[0]!.pan).toBe(-0.5);
		applyLocalMix(
			e,
			{ gains: {}, muted: [], soloed: [], master: 1 },
			defaults,
			new Map([["b", 0.3]]),
		);
		expect(e.stems[0]!.pan).toBe(0);
		expect(e.stems[1]!.pan).toBe(0.3);
	});
});
