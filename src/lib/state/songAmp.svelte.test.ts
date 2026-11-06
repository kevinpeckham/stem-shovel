import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import type { StemEngine } from "#lib/audio/engine.svelte.js";
import { SongAmp } from "./songAmp.svelte.js";

/**
 * The practice amp's play-along transport over stand-ins: the engine and the
 * metronome record their calls, and the count-in's bar runs on fake timers.
 */
function setup(opts: { playing?: boolean; status?: string } = {}) {
	const engine = {
		status: opts.status ?? "ready",
		playing: opts.playing ?? false,
		play: vi.fn(async () => {}),
		pause: vi.fn(),
		seek: vi.fn(),
	};
	const metronome = {
		bpm: 120,
		beatsPerBar: 4,
		load: vi.fn(),
		start: vi.fn(async () => {}),
		stop: vi.fn(),
	};
	const amp = new SongAmp({ engine: () => engine as unknown as StemEngine, metronome });
	return { amp, engine, metronome };
}

describe("SongAmp", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	test("toggle opens and closes the panel", () => {
		const { amp } = setup();
		expect(amp.open).toBe(false);
		amp.toggle();
		expect(amp.open).toBe(true);
		amp.toggle();
		expect(amp.open).toBe(false);
	});

	test("without the count-in, play starts the song at once", async () => {
		const { amp, engine, metronome } = setup();
		amp.countIn = false;
		await amp.play(false);
		expect(engine.play).toHaveBeenCalledOnce();
		expect(engine.seek).not.toHaveBeenCalled();
		expect(metronome.start).not.toHaveBeenCalled();
	});

	test("with the count-in, a bar of clicks comes first, then the song", async () => {
		const { amp, engine, metronome } = setup();
		await amp.play(true);
		expect(engine.seek).toHaveBeenCalledWith(0);
		expect(metronome.load).toHaveBeenCalledOnce();
		expect(metronome.start).toHaveBeenCalledOnce();
		expect(amp.countingIn).toBe(true);
		expect(engine.play).not.toHaveBeenCalled();
		// 4 beats at 120 bpm: two seconds.
		vi.advanceTimersByTime(1999);
		expect(engine.play).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(metronome.stop).toHaveBeenCalledOnce();
		expect(amp.countingIn).toBe(false);
		expect(engine.play).toHaveBeenCalledOnce();
	});

	test("stop during the count-in stops the clicks and never plays", async () => {
		const { amp, engine, metronome } = setup();
		await amp.play(false);
		amp.stop();
		expect(metronome.stop).toHaveBeenCalledOnce();
		expect(amp.countingIn).toBe(false);
		expect(engine.pause).toHaveBeenCalledOnce();
		vi.advanceTimersByTime(5000);
		expect(engine.play).not.toHaveBeenCalled();
	});

	test("play while playing pauses; a player not ready does nothing", async () => {
		const playing = setup({ playing: true });
		await playing.amp.play(false);
		expect(playing.engine.pause).toHaveBeenCalledOnce();
		expect(playing.metronome.start).not.toHaveBeenCalled();
		const loading = setup({ status: "loading" });
		await loading.amp.play(true);
		expect(loading.engine.seek).not.toHaveBeenCalled();
		expect(loading.metronome.start).not.toHaveBeenCalled();
	});

	test("dispose clears the count-in without pausing the song", async () => {
		const { amp, engine, metronome } = setup();
		await amp.play(false);
		amp.dispose();
		expect(metronome.stop).toHaveBeenCalledOnce();
		expect(engine.pause).not.toHaveBeenCalled();
		vi.advanceTimersByTime(5000);
		expect(engine.play).not.toHaveBeenCalled();
	});
});
