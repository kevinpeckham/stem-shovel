import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import type { StemEngine } from "./engine.svelte.js";
import { barGrid } from "./measures.js";
import type { SongChange } from "#lib/val/SongChangeSchema.js";

/** The scheduling loop is driven by hand: each call is one tick, given the time to queue up to. */
const h = vi.hoisted(() => ({ tick: null as ((until: number) => void) | null }));
vi.mock("./lookahead.js", () => ({
	startLookahead: (_ctx: unknown, queueUntil: (until: number) => void) => {
		h.tick = queueUntil;
		return () => (h.tick = null);
	},
}));
const { StemClick } = await import("./stemClick.svelte.js");

/** 120 bpm in 4/4 from 0:00: a beat every half second. */
const grid = barGrid(
	[
		{ kind: "tempo", start: 0, value: "120" },
		{ kind: "meter", start: 0, value: "4/4" },
	] as SongChange[],
	0,
)!;

/** A context that records when each click's oscillator was started. */
function fakeContext() {
	const starts: number[] = [];
	const param = () => ({
		value: 0,
		setValueAtTime: vi.fn(),
		exponentialRampToValueAtTime: vi.fn(),
		setTargetAtTime: vi.fn(),
	});
	const node = () => {
		const n = { gain: param(), connect: (to: unknown) => to, disconnect: vi.fn() };
		return n;
	};
	const ctx = {
		currentTime: 0,
		destination: {},
		createGain: node,
		createOscillator: () => ({
			frequency: param(),
			connect: (to: unknown) => to,
			start: (at: number) => starts.push(at),
			stop: vi.fn(),
		}),
	};
	return { ctx, starts };
}

/** An engine whose clock origin and playhead the test moves; `position` is the last frame's value. */
function fakeEngine(ctx: { currentTime: number }) {
	const state = { origin: 0, position: 0 };
	const engine = {
		playing: true,
		duration: 100,
		prelude: null,
		audioContext: ctx,
		get position() {
			return state.position;
		},
		clockAt: (seconds: number) => state.origin + seconds,
		playhead: () => ctx.currentTime - state.origin,
	};
	return { engine: engine as unknown as StemEngine, state };
}

beforeEach(() => (h.tick = null));

describe("StemClick", () => {
	test("clicks land on the grid's beats on the engine's clock", () => {
		const { ctx, starts } = fakeContext();
		const { engine, state } = fakeEngine(ctx);
		ctx.currentTime = 50;
		state.origin = 50 - 8.01; // playing from just after bar 5's downbeat
		state.position = 8.01;
		const click = new StemClick(engine, () => grid);
		click.setOn(true);
		h.tick!(50.6);
		// The beat at 8.5 s of the song sounds at origin + 8.5.
		expect(starts).toHaveLength(1);
		expect(starts[0]).toBeCloseTo(state.origin + 8.5, 6);
		click.dispose();
	});

	test("at a loop's turn the plan starts from the clock, not from a position a frame old: the click does not drop out for a pass", () => {
		const { ctx, starts } = fakeContext();
		const { engine, state } = fakeEngine(ctx);
		// A loop of bars 5 and 6 (8 s to 12 s), near its end.
		ctx.currentTime = 100;
		state.origin = 100 - 11.9;
		state.position = 11.9;
		const click = new StemClick(engine, () => grid);
		click.setOn(true);
		h.tick!(100.05);
		expect(starts).toHaveLength(0);
		// The loop turns at 100.1: the clock's origin jumps, and the scheduler's timer fires before
		// the next animation frame, so `position` still reads the loop's end.
		ctx.currentTime = 100.11;
		state.origin = 100.1 - 8;
		state.position = 11.99;
		h.tick!(100.21);
		ctx.currentTime = 100.55;
		h.tick!(100.65);
		// The first beat of the new pass (8.5 s of the song) sounds half a second after the turn…
		expect(starts).toHaveLength(1);
		expect(starts[0]).toBeCloseTo(100.6, 6);
		// …and the beats after it follow, a pass's worth of them, none planned past the loop's end.
		for (const now of [101.05, 101.55, 102.05]) {
			ctx.currentTime = now;
			h.tick!(now + 0.1);
		}
		expect(starts.map((t) => Math.round((t - 100.1) * 10) / 10)).toEqual([0.5, 1, 1.5, 2]);
		click.dispose();
	});

	test("a count-in still plans from the playhead when the clock is behind it", () => {
		const { ctx, starts } = fakeContext();
		const { engine, state } = fakeEngine(ctx);
		// The stems are held for a bar: the clock says 6 s, the playhead waits at 8 s.
		ctx.currentTime = 20;
		state.origin = 20 - 6;
		state.position = 8;
		(engine as unknown as { playhead: () => number }).playhead = () => 8;
		const click = new StemClick(engine, () => grid);
		click.setOn(true);
		h.tick!(22.2);
		// Nothing before the playhead: the first beat planned is the one the stems enter on.
		expect(starts[0]).toBeCloseTo(state.origin + 8, 6);
		click.dispose();
	});
});
