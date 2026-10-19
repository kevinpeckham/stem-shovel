import { STUDIO_INSTRUMENTS, isInstrument } from "#lib/constants/studioInstruments.js";
import { describe, expect, it, vi } from "vite-plus/test";

/** The registry over stand-ins for the instrument singletons (they carry Web Audio); the shape and the sampler's wiring are what the test reads. */
const spies = vi.hoisted(() => ({
	scheduleNote: vi.fn(() => () => {}),
	scheduleHit: vi.fn(() => () => {}),
	startSamplerVoice: vi.fn(() => ({ release: vi.fn() })),
}));
const fakePiano = (out: string) => ({
	hostContext: vi.fn(),
	load: vi.fn(),
	warm: vi.fn(),
	output: () => out,
	scheduleNote: spies.scheduleNote,
	onNote: vi.fn(() => () => {}),
	cancelScheduled: vi.fn(),
	fxSettings: vi.fn(),
	instrument: "epiano",
});
vi.mock("./piano.svelte", () => ({
	piano: fakePiano("piano-out"),
	chordPiano: fakePiano("chords-out"),
}));
vi.mock("./drumMachine.svelte", () => ({
	drumMachine: {
		hostContext: vi.fn(),
		readyKit: vi.fn(async () => {}),
		output: () => "drums-out",
		scheduleHit: spies.scheduleHit,
		hit: vi.fn(),
		onHit: vi.fn(() => () => {}),
		project: { kit: "acoustic", fx: {} },
		rowFor: vi.fn(),
	},
}));
vi.mock("./samplerVoice", () => ({ startSamplerVoice: spies.startSamplerVoice }));
const { INSTRUMENTS, samplerFor } = await import("./instruments");

const track = (over: Record<string, unknown> = {}) =>
	({
		id: "t",
		name: "T",
		gain: 1,
		pan: 0,
		muted: false,
		solo: false,
		armed: false,
		input: null,
		kind: "midi",
		...over,
	}) as never;

describe("the instrument registry", () => {
	it("has an adapter for every instrument, and the guard knows them", () => {
		expect(Object.keys(INSTRUMENTS).sort()).toEqual([...STUDIO_INSTRUMENTS].sort());
		for (const s of STUDIO_INSTRUMENTS) expect(INSTRUMENTS[s].id).toBe(s);
		expect(isInstrument("sampler")).toBe(true);
		expect(isInstrument("mic")).toBe(false);
		expect(INSTRUMENTS.piano.latency).toBe("output");
		expect(INSTRUMENTS.drums.latency).toBe("none");
	});
	it("the piano adapter hands notes to the piano; the drums map General MIDI notes to voices", () => {
		const cancel = INSTRUMENTS.piano.scheduleNote(
			{ pitch: 60, velocity: 0.8, at: 1, duration: 0.5 },
			track(),
		);
		expect(spies.scheduleNote).toHaveBeenCalledWith(60, 0.8, 1, 0.5);
		expect(typeof cancel).toBe("function");
		INSTRUMENTS.drums.scheduleNote({ pitch: 36, velocity: 1, at: 2, duration: 0.1 }, track());
		expect(spies.scheduleHit).toHaveBeenCalledWith("kick", 1, 2);
		expect(
			INSTRUMENTS.drums.scheduleNote({ pitch: 1, velocity: 1, at: 2, duration: 0.1 }, track()),
		).toBeNull();
		expect(INSTRUMENTS.piano.output()).toBe("piano-out");
	});
	it("the sampler plays the track's recording through its output once hosted, and nothing without one", () => {
		const sampler = INSTRUMENTS.sampler;
		const buffer = { duration: 2 } as AudioBuffer;
		const out = { connect: vi.fn() };
		const ctx = { currentTime: 10, createGain: () => out } as unknown as AudioContext;
		expect(sampler.output()).toBeNull();
		sampler.host(ctx, { bufferOf: (id) => (id === "src1" ? buffer : null) });
		expect(sampler.output()).toBe(out);
		expect(
			sampler.scheduleNote({ pitch: 62, velocity: 0.5, at: 11, duration: 1 }, track()),
		).toBeNull();
		const settings = samplerFor("src1");
		expect(settings).toEqual({
			sourceId: "src1",
			root: 60,
			attack: 0.005,
			release: 0.15,
			loop: false,
		});
		const cancel = sampler.scheduleNote(
			{ pitch: 62, velocity: 0.5, at: 11, duration: 1 },
			track({ sampler: settings }),
		);
		expect(spies.startSamplerVoice).toHaveBeenCalledWith(ctx, out, buffer, settings, 62, 0.5, 11);
		expect(typeof cancel).toBe("function");
		expect(
			sampler.scheduleNote(
				{ pitch: 62, velocity: 0.5, at: 11, duration: 1 },
				track({ sampler: { ...settings, sourceId: "gone" } }),
			),
		).toBeNull();
	});
});
