import { DRUM_GM_NOTES, DRUM_MIDI_IN_NOTES } from "#lib/constants/drumMachine.js";
import { SAMPLER_DEFAULTS, type StudioInstrument } from "#lib/constants/studioInstruments.js";
import type { ClipNoteEvent } from "#lib/utils/clipNoteEvents.js";
import type { NoteEvent } from "#lib/utils/pairNoteEvents.js";
import type { StudioTrack } from "#lib/val/StudioSchema.js";
import { createDrumBus } from "./drumBus";
import { drumMachine } from "./drumMachine.svelte";
import { playDrumHit, type DrumPlayState } from "./drumRender";
import { drumKit } from "./kits";
import { chordPiano, piano, type PianoEngine } from "./piano.svelte";
import { createPianoFx } from "./pianoFx";
import { startSampledVoice } from "./pianoSamples";
import { isSampledInstrument, startSampledInstrumentVoice } from "./sampledInstruments";
import { startSamplerVoice } from "./samplerVoice";
import { startVoice } from "./synthVoice";

/**
 * The instrument registry (docs/dawn-daw-plan.md, D6): what Dawn's engine
 * asks of an instrument, one adapter per entry of `STUDIO_INSTRUMENTS`,
 * so the engine never asks which one it holds. Each is hosted in the
 * engine's context, wakes before its first note (`prepare`), gives its
 * output node for a track's capture, plays a note at a context time or
 * now, reports the notes played by hand for a MIDI take, says how a
 * hand-played take shifts, and renders a clip's notes offline for the
 * bounce.
 */
export interface ScheduledNote {
	pitch: number;
	velocity: number;
	at: number;
	duration: number;
}
export interface InstrumentEnv {
	/** A recording the song holds, for the sampler. */
	bufferOf: (sourceId: string) => AudioBuffer | null;
}
export interface InstrumentAdapter {
	id: StudioInstrument;
	/** How a take played by hand on it shifts: against what was heard (the output latency), or not at all (it runs on the clock). */
	latency: "output" | "none";
	host(ctx: AudioContext, env: InstrumentEnv): void;
	prepare(): Promise<void>;
	output(): AudioNode | null;
	/** A note on the context's clock; the way to cut it short, or null when it was skipped. */
	scheduleNote(note: ScheduledNote, track: StudioTrack): (() => void) | null;
	/** A note now (the roll's click, the keyboard column). */
	audition(note: Omit<ScheduledNote, "at">, track: StudioTrack): void;
	/** The notes played by hand, each stamped by the context's clock. */
	onNote(listener: (e: NoteEvent) => void): () => void;
	cancelScheduled(): void;
	renderOffline(
		off: OfflineAudioContext,
		into: AudioNode,
		events: ClipNoteEvent[],
		bpm: number,
		track: StudioTrack,
	): Promise<void>;
}

function pianoAdapter(id: "piano" | "chords", engine: PianoEngine): InstrumentAdapter {
	let ctx: AudioContext | null = null;
	return {
		id,
		latency: "output",
		host(c) {
			ctx = c;
			engine.hostContext(c);
		},
		async prepare() {
			engine.load();
			engine.warm();
		},
		output: () => engine.output(),
		scheduleNote: (n) => engine.scheduleNote(n.pitch, n.velocity, n.at, n.duration),
		audition(n) {
			if (!ctx) return;
			engine.warm();
			engine.scheduleNote(n.pitch, n.velocity, ctx.currentTime + 0.01, n.duration);
		},
		onNote: (l) => engine.onNote(l),
		cancelScheduled: () => engine.cancelScheduled(),
		async renderOffline(off, into, events) {
			// The current sound through a copy of the effects chain on the offline context: the Grand's samples or a small sampled instrument once decoded (an AudioBuffer plays on any context), the synth standing in as the live instrument does.
			const fx = createPianoFx(off, engine.fxSettings());
			fx.master.disconnect();
			fx.master.connect(into);
			const instrument = engine.instrument;
			for (const e of events) {
				const voice =
					instrument === "grand"
						? startSampledVoice(off, fx.input, e.pitch, e.velocity, e.at)
						: isSampledInstrument(instrument)
							? startSampledInstrumentVoice(off, fx.input, instrument, e.pitch, e.velocity, e.at)
							: startVoice(off, fx.input, instrument, e.pitch, e.velocity, e.at);
				const played =
					voice ??
					startVoice(
						off,
						fx.input,
						isSampledInstrument(instrument) ? instrument : "epiano",
						e.pitch,
						e.velocity,
						e.at,
					);
				played.release(e.at + e.duration);
			}
			fx.dispose();
		},
	};
}

const drumsAdapter: InstrumentAdapter = {
	id: "drums",
	latency: "none",
	host: (c) => drumMachine.hostContext(c),
	prepare: () => drumMachine.readyKit(),
	output: () => drumMachine.output(),
	scheduleNote(n) {
		const voice = DRUM_MIDI_IN_NOTES[n.pitch];
		return voice ? drumMachine.scheduleHit(voice, n.velocity, n.at) : null;
	},
	audition(n) {
		const voice = DRUM_MIDI_IN_NOTES[n.pitch];
		if (voice) void drumMachine.hit(voice, n.velocity);
	},
	// A hit has no length of its own: a tenth of a second, the pad's blink.
	onNote: (push) =>
		drumMachine.onHit((h) => {
			const pitch = DRUM_GM_NOTES[h.voice];
			push({ on: true, pitch, velocity: h.velocity, time: h.time });
			push({ on: false, pitch, velocity: 0, time: h.time + 0.1 });
		}),
	cancelScheduled() {},
	async renderOffline(off, into, events, bpm) {
		const kit = drumKit(drumMachine.project.kit);
		await kit.load(off);
		const bus = createDrumBus(off, structuredClone(drumMachine.project.fx), bpm);
		bus.master.disconnect();
		bus.master.connect(into);
		const state: DrumPlayState = { openHat: null };
		for (const e of events) {
			const voice = DRUM_MIDI_IN_NOTES[e.pitch];
			if (!voice) continue;
			playDrumHit(off, kit, bus, drumMachine.rowFor(voice), e.velocity, e.at, state);
		}
	},
};

/** The sampler: a track's own recording across the keys (samplerVoice.ts); it has no keys of its own, so it records nothing by hand. */
function samplerAdapter(): InstrumentAdapter {
	let ctx: AudioContext | null = null;
	let out: GainNode | null = null;
	let env: InstrumentEnv | null = null;
	const settingsOf = (track: StudioTrack) => track.sampler ?? null;
	return {
		id: "sampler",
		latency: "none",
		host(c, e) {
			ctx = c;
			env = e;
			out = c.createGain();
		},
		async prepare() {},
		output: () => out,
		scheduleNote(n, track) {
			const s = settingsOf(track);
			const buffer = s && env?.bufferOf(s.sourceId);
			if (!ctx || !out || !s || !buffer) return null;
			const voice = startSamplerVoice(ctx, out, buffer, s, n.pitch, n.velocity, n.at);
			voice.release(n.at + n.duration);
			const c = ctx;
			return () => voice.release(c.currentTime);
		},
		audition(n, track) {
			if (!ctx) return;
			this.scheduleNote({ ...n, at: ctx.currentTime + 0.01 }, track);
		},
		onNote: () => () => {},
		cancelScheduled() {},
		async renderOffline(off, into, events, _bpm, track) {
			const s = settingsOf(track);
			const buffer = s && env?.bufferOf(s.sourceId);
			if (!s || !buffer) return;
			for (const e of events)
				startSamplerVoice(off, into, buffer, s, e.pitch, e.velocity, e.at).release(
					e.at + e.duration,
				);
		},
	};
}

export const INSTRUMENTS: Record<StudioInstrument, InstrumentAdapter> = {
	piano: pianoAdapter("piano", piano),
	chords: pianoAdapter("chords", chordPiano),
	drums: drumsAdapter,
	sampler: samplerAdapter(),
};

/** A new sampler track's settings for a recording. */
export const samplerFor = (sourceId: string) => ({ sourceId, ...SAMPLER_DEFAULTS });
