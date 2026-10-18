import { METER_ZERO, nextMeter, type MeterState } from "#lib/utils/meterLevel.js";
import { automationValueAt } from "#lib/utils/automationValueAt.js";
import { editAutomation } from "#lib/utils/editAutomation.js";
import { scheduleAutomation } from "#lib/utils/scheduleAutomation.js";
import { MixHistory } from "#lib/utils/mixHistory.js";
import { audioSession } from "#lib/utils/audioSession.js";
import { appendChunkPeaks, chunkPeaksState } from "#lib/utils/chunkPeaks.js";
import { coveredClips } from "#lib/utils/coveredClips.js";
import { encodeWav24 } from "#lib/utils/encodeWav24.js";
import { normalizeBuffer } from "#lib/utils/normalizeBuffer.js";
import { sliceBuffer } from "#lib/utils/sliceBuffer.js";
import { snapToGrid } from "#lib/utils/snapToGrid.js";
import { splitClipAt } from "#lib/utils/splitClipAt.js";
import { takePieces } from "#lib/utils/takePieces.js";
import { trimmedClip } from "#lib/utils/trimmedClip.js";
import { pairNoteEvents, type NoteEvent } from "#lib/utils/pairNoteEvents.js";
import { sliceNotes } from "#lib/utils/sliceNotes.js";
import { quantizeNotes } from "#lib/utils/quantizeNotes.js";
import { notesFromMidiSummary, notesToMidiBlob } from "#lib/utils/midiNotesFile.js";
import { DRUM_GM_NOTES, DRUM_MIDI_IN_NOTES } from "#lib/constants/drumMachine.js";
import type { MidiSummary } from "./midi";
import {
	MAX_STUDIO_CLIPS,
	MAX_STUDIO_NOTES_PER_CLIP,
	MAX_STUDIO_TRACKS,
	STUDIO_FADER_MAX,
} from "#lib/constants/studio.js";
import type {
	StudioArrangement,
	StudioClip,
	StudioInput,
	StudioInputSource,
	StudioNote,
	StudioSourceView,
	StudioTrack,
	StudioTrackFx,
	StudioTrackKind,
	StudioAutomationPoint,
	StudioAutomation,
	StudioBus,
	StudioInsert,
	StudioSend,
} from "#lib/val/StudioSchema.js";
import { nanoid } from "nanoid";
import { amp, loadAmpWorklet } from "./amp.svelte";
import { drumMachine } from "./drumMachine.svelte";
import { inputSources, outputLatencyMs } from "./inputs.svelte";
import { chordPiano, piano } from "./piano.svelte";
import { startLookahead } from "./lookahead";
import { metronome } from "./metronome.svelte";
import { claimPlayback, releasePlayback } from "./onlyOnePlays";
import { computePeaks } from "./peaks";
import { playThroughSilentSwitch } from "./playThroughSilentSwitch";
import { createStripGraph, type StripGraph } from "./stripGraph";
import { insertsOf } from "#lib/utils/insertsFromFx.js";
import { automationLanes } from "#lib/utils/automationLanes.js";
import { nanoid as newLocalId } from "nanoid";
import { MAX_STUDIO_BUSES, sendLaneKey } from "#lib/constants/studioInserts.js";

/**
 * The Studio's engine (docs/multitrack-recorder.md): tracks of clips cut
 * from sources, played from one AudioContext at the device's rate. Each
 * track is a gain (fader, mute, solo) into a panner into an analyser (its
 * meter) into the master; each clip at play time is a buffer source into a
 * gain of its own (the clip's gain and its fades) into the track. Every
 * clip of a pass starts from one `when` on the context clock, so the
 * tracks never drift. Recording arms a capture worklet per armed track
 * (static/worklets/track-capture.js) from the same frame the transport
 * starts on; a take becomes a source and a clip where recording began,
 * shifted earlier by the input's measured latency. The arrangement is
 * runes state the page autosaves; every edit first snapshots it for undo.
 */

/** A source as the engine holds it: the decoded audio and what the lane draws. */
interface StudioSource {
	id: string;
	label: string;
	durationSeconds: number;
	sampleRate: number;
	channels: number;
	/** 1024 bins of the whole file, for the lane at any zoom. */
	peaks: Float32Array;
	status: "decoding" | "ready" | "failed";
	/** Recorded here and not yet on the server (the queue is uploading it). */
	pending: boolean;
}

/** A finished take from one armed track, for the page to upload and the engine already holds. */
export interface StudioTake {
	sourceId: string;
	trackId: string;
	trackLabel: string;
	takeNumber: number;
	kind: "take" | "import";
	buffer: AudioBuffer;
	blob: Blob;
	/** The file's name for the upload ("Guitar.wav"; an import keeps its own). */
	filename: string;
	durationSeconds: number;
}

type StudioPhase = "idle" | "counting" | "playing" | "recording";

/** Samples kept before the start of every take, so a late input can be shifted earlier by up to this much. */
const LEAD_SECONDS = 0.3;
const START_AHEAD = 0.1;
const RAMP = 0.015;
/** The shortest fade at a clip's edges, so a cut never clicks. */
const EDGE_FADE = 0.003;
const LOAD_CONCURRENCY = 3;
/** Frames per peak of a take's live waveform (about a hundredth of a second). */
export const LIVE_PEAK_FRAMES = 512;
const UNDO_DEPTH = 100;

export const STUDIO_INPUT_LABELS: Record<StudioInputSource, string> = {
	mic: "Microphone",
	line: "Line in",
	computer: "Computer",
	piano: "Piano",
	chords: "Chord player",
	drums: "Drum machine",
	amp: "Practice amp",
};
/** The instruments the Studio hosts in its own context (phase 2), played from their panels and recorded sample-accurately. */
export const STUDIO_INSTRUMENTS = ["piano", "chords", "drums"] as const;
export type StudioInstrument = (typeof STUDIO_INSTRUMENTS)[number];
export const isInstrument = (s: StudioInputSource): s is StudioInstrument =>
	s === "piano" || s === "chords" || s === "drums";

function emptyArrangement(): StudioArrangement {
	return {
		version: 1,
		bpm: 120,
		beatsPerBar: 4,
		gridOn: true,
		countIn: true,
		click: true,
		loop: null,
		master: 1,
		tracks: [],
		clips: [],
	};
}

function localId(): string {
	return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

interface Playing {
	clipId: string;
	src: AudioBufferSourceNode;
	gain: GainNode;
}
/** A MIDI track recording (phase 3): the instrument's note events as they come, until Stop pairs them into a clip. */
interface MidiCapture {
	trackId: string;
	source: StudioInstrument;
	events: NoteEvent[];
	/** Stops listening. */
	off: () => void;
}
/** A note of a MIDI clip waiting for its moment: fired by the look-ahead once `at` is within reach. */
interface QueuedNote {
	at: number;
	clipId: string;
	fired: boolean;
	/** Schedules the note; answers the way to cut it short, or null when it was skipped (a muted track). */
	fire: () => (() => void) | null;
}
interface Capture {
	trackId: string;
	node: AudioWorkletNode;
	/** The nodes between the input and the worklet, to disconnect. */
	feed: AudioNode[];
	chunks: Float32Array[][];
	channels: number;
	done: Promise<void>;
	finish: () => void;
}

class StudioEngine {
	arrangement = $state<StudioArrangement>(emptyArrangement());
	sources = $state<Record<string, StudioSource>>({});
	phase = $state<StudioPhase>("idle");
	/** The playhead, in seconds on the timeline; written every frame while the transport runs. */
	position = $state(0);
	/**
	 * The meters (docs/multitrack-recorder.md, "Meters"): each track's level
	 * after its fader, effects and pan, and the master's, with a peak-hold mark
	 * and a clip memory that sticks until `resetClips` (utils/meterLevel.ts),
	 * as the stem player's.
	 */
	levels = $state.raw<Record<string, MeterState>>({});
	masterLevel = $state.raw<MeterState>(METER_ZERO);
	/** The context and the capture are open (a gesture did it). */
	ready = $state(false);
	notice = $state<string | null>(null);
	/** Decoded audio held, in bytes, for the readout. */
	memoryBytes = $state(0);
	/** How many sources are still decoding. */
	decoding = $state(0);
	/** The recording pass under way began here on the timeline. */
	recordFrom = $state(0);
	/** Takes recorded in this song so far (the next take's number is one more). */
	takeCount = $state(0);
	canUndo = $state(false);
	canRedo = $state(false);
	/** The arrangement changed since the page last saved it (the page clears it). */
	dirty = $state(false);
	/** The output path's latency as the browser reports it, for the Inputs panel. */
	outputLatencyMs = $state(0);
	/** Hear the armed tracks' existing clips while recording over them (off: punch over them in silence). */
	playArmed = $state(true);
	/** Shift piano and chord takes earlier by the output latency: a part played by hand against what is heard lands that much late (docs/looper.md). */
	compensateInstruments = $state(true);
	/** The drum machine was started by this transport (an armed drums track), so stopping stops it. */
	#startedDrums = false;

	#ctx: AudioContext | null = null;
	/** The master strip (stripGraph.ts): its fader is the master level, its inserts the master chain, its meter the master meter. */
	#masterStrip: StripGraph | null = null;
	#buses = new Map<string, StripGraph>();
	#buffers = new Map<string, AudioBuffer>();
	#tracks = new Map<string, StripGraph>();
	#playing: Playing[] = [];
	/** Each pass under way: the timeline second it began at and the context time it began on. */
	#passes: { from: number; when: number; to: number | null }[] = [];
	#stopLookahead: (() => void) | null = null;
	#frame = 0;
	#meterBuf: Float32Array<ArrayBuffer> | null = null;
	#captures: Capture[] = [];
	#past: StudioArrangement[] = [];
	#future: StudioArrangement[] = [];
	/**
	 * The mix's moves (fader, pan, mute, solo, master, effects) join the undo
	 * stack one step per gesture (utils/mixHistory.ts decides where a gesture
	 * starts); the stack itself is `#past`, so ⌘Z steps through edits and
	 * moves alike. Cleared with the history on open.
	 */
	#mixGestures = new MixHistory<null>();
	#metronomeStopTimer: ReturnType<typeof setTimeout> | null = null;
	#opening: Promise<void> | null = null;
	#stopAt = 0;
	#transport = { stop: () => this.stop() };
	/** Bumped as each take's live peaks grow, so a lane redraws its band (the peaks themselves stay out of the proxy). */
	liveTick = $state(0);
	/** One peak per LIVE_PEAK_FRAMES of the take under way on each armed track, from where recording began. */
	#livePeaks = new Map<string, number[]>();
	/** The take under way on a track, as peaks for its band; empty when none. */
	livePeaksOf(trackId: string): number[] {
		return this.#livePeaks.get(trackId) ?? [];
	}
	/** The page's hook for a finished take (upload it). */
	ontake: ((take: StudioTake) => void) | null = null;

	// ── MIDI (phase 3) ─────────────────────────────────────────────────────
	#midiCaptures: MidiCapture[] = [];
	/** Notes of the pass under way, in time order; `#midiNext` is the first not yet fired. */
	#midiQueue: QueuedNote[] = [];
	#midiNext = 0;
	/** Notes sounding or scheduled, each with the way to cut it short. */
	#midiVoices: { clipId: string; ends: number; cancel: () => void }[] = [];
	/** A MIDI track being rendered to audio: the drum machine is not started as a backing for the capture track. */
	#freezing = false;
	/** The notes a MIDI track has recorded so far in the pass under way, for its lane. */
	liveNotesOf(trackId: string): StudioNote[] {
		const cap = this.#midiCaptures.find((c) => c.trackId === trackId);
		const ctx = this.#ctx;
		const when = this.#passes[0]?.when;
		if (!cap || !ctx || when === undefined || cap.events.length === 0) return [];
		return pairNoteEvents(cap.events, { from: when, shift: 0, end: ctx.currentTime });
	}

	get sampleRate() {
		return this.#ctx?.sampleRate ?? 48000;
	}
	get barSeconds() {
		return (this.arrangement.beatsPerBar * 60) / this.arrangement.bpm;
	}
	get beatSeconds() {
		return 60 / this.arrangement.bpm;
	}
	/** The end of the last clip, or a bar when the song is empty. */
	get duration() {
		let end = 0;
		for (const c of this.arrangement.clips) end = Math.max(end, c.start + c.duration);
		return end;
	}
	get anySolo() {
		return this.arrangement.tracks.some((t) => t.solo);
	}
	get armedTracks() {
		return this.arrangement.tracks.filter((t) => t.armed && t.input);
	}
	get recording() {
		return this.phase === "recording";
	}
	get running() {
		return this.phase !== "idle";
	}

	// ── Opening ────────────────────────────────────────────────────────────
	/** Opens the context and the capture from a gesture; a second call while the first loads waits for it. */
	async open(): Promise<void> {
		if (this.#opening) return this.#opening;
		if (this.#ctx) {
			if (this.#ctx.state !== "running") await this.#ctx.resume().catch(() => {});
			if (inputSources.context !== this.#ctx) this.#attachInputs();
			return;
		}
		this.#opening = this.#openNow().finally(() => {
			this.#opening = null;
		});
		return this.#opening;
	}
	async #openNow() {
		playThroughSilentSwitch();
		const session = audioSession();
		if (session) session.type = "play-and-record";
		const ctx = new AudioContext({ latencyHint: "interactive" });
		this.#ctx = ctx;
		// The instruments build their graphs here (docs/looper.md, "One audio context"), so their sound reaches a capture sample-accurately.
		piano.hostContext(ctx);
		chordPiano.hostContext(ctx);
		drumMachine.hostContext(ctx);
		metronome.hostContext(ctx);
		await ctx.audioWorklet.addModule("/worklets/track-capture.js");
		// The Practice Amp too (docs/practice-amp.md, "The band"): a track takes its output as heard, pedals and all.
		amp.hostContext(ctx, { gateWorklet: await loadAmpWorklet(ctx) });
		if (ctx.state !== "running") await ctx.resume().catch(() => {});
		const master = createStripGraph(ctx, { inserts: this.arrangement.masterInserts ?? [], pan: 0 });
		master.fader.gain.value = this.arrangement.master;
		master.route(ctx.destination);
		this.#masterStrip = master;
		this.#meterBuf = new Float32Array(1024);
		this.#ensureAllStrips();
		this.#attachInputs();
		this.outputLatencyMs = outputLatencyMs(ctx);
		cancelAnimationFrame(this.#meterFrame);
		this.#meter();
		this.ready = true;
		// Sources already loaded (before a gesture) decoded in a scratch context at their own rate; the live context resamples on play.
	}
	#attachInputs() {
		const ctx = this.#ctx;
		if (!ctx || !this.#masterStrip) return;
		inputSources.attach(ctx, {
			monitorOut: this.#masterStrip.input,
			onsource: () => {
				// A device change while armed: the capture re-feeds on the next record.
			},
		});
	}
	/** Every bus and track as a strip, routed; buses and tracks that are gone dropped. */
	#ensureAllStrips() {
		for (const id of Array.from(this.#buses.keys()))
			if (!this.arrangement.buses?.some((b) => b.id === id)) this.#dropBus(id);
		for (const b of this.arrangement.buses ?? []) this.#ensureBus(b.id);
		for (const id of Array.from(this.#tracks.keys()))
			if (!this.arrangement.tracks.some((t) => t.id === id)) this.#dropTrackNodes(id);
		for (const t of this.arrangement.tracks) this.#ensureTrackNodes(t.id);
		this.#routeAll();
	}
	#bus(id: string) {
		return this.arrangement.buses?.find((b) => b.id === id) ?? null;
	}
	#ensureBus(busId: string): StripGraph | null {
		const ctx = this.#ctx;
		const bus = this.#bus(busId);
		if (!ctx || !this.#masterStrip || !bus) return null;
		let strip = this.#buses.get(busId);
		if (strip) return strip;
		strip = createStripGraph(ctx, { inserts: insertsOf(bus), pan: bus.pan });
		strip.fader.gain.value = bus.muted ? 0 : bus.gain;
		strip.route(this.#masterStrip.input);
		this.#buses.set(busId, strip);
		this.#settleAutomation(bus, strip, ctx.currentTime);
		return strip;
	}
	#dropBus(busId: string) {
		const strip = this.#buses.get(busId);
		if (!strip) return;
		strip.dispose();
		this.#buses.delete(busId);
	}
	#ensureTrackNodes(trackId: string): StripGraph | null {
		const ctx = this.#ctx;
		if (!ctx || !this.#masterStrip) return null;
		let strip = this.#tracks.get(trackId);
		if (strip) return strip;
		const track = this.arrangement.tracks.find((t) => t.id === trackId);
		// The fader, the volume lane, the inserts, the pan, the meter, then a bus or the master (stripGraph.ts).
		strip = createStripGraph(ctx, {
			inserts: track ? insertsOf(track) : [],
			pan: track?.pan ?? 0,
		});
		this.#tracks.set(trackId, strip);
		if (track) {
			strip.fader.gain.value = this.#effectiveGain(track);
			this.#settleAutomation(track, strip, ctx.currentTime);
		}
		return strip;
	}
	/** Every track to its bus or the master, with its sends; every bus to the master. */
	#routeAll() {
		const master = this.#masterStrip;
		if (!master) return;
		const busInputs = new Map<string, AudioNode>();
		for (const [id, strip] of this.#buses) {
			strip.route(master.input);
			busInputs.set(id, strip.input);
		}
		for (const t of this.arrangement.tracks) {
			const strip = this.#tracks.get(t.id);
			if (!strip) continue;
			const dest = (t.output && busInputs.get(t.output)) || master.input;
			strip.route(dest);
			strip.setSends(t.sends ?? [], busInputs, 0);
		}
	}
	#dropTrackNodes(trackId: string) {
		const strip = this.#tracks.get(trackId);
		if (!strip) return;
		strip.dispose();
		this.#tracks.delete(trackId);
	}

	// ── Loading ────────────────────────────────────────────────────────────
	/** A song from the page: its arrangement and its sources, fetched and decoded three at a time. */
	async load(song: { current: StudioArrangement | null; sources: StudioSourceView[] }) {
		this.stop();
		this.#past = [];
		this.#future = [];
		this.#mixGestures.clear();
		this.canUndo = this.canRedo = false;
		this.#buffers.clear();
		for (const id of this.#tracks.keys()) this.#dropTrackNodes(id);
		this.arrangement = song.current ? structuredClone(song.current) : emptyArrangement();
		// An empty song starts with one track armed to the microphone, so the page never opens bare and Record works at once (Kevin);
		// not an edit: the song is made on the server only when something lands on it.
		if (this.arrangement.tracks.length === 0)
			this.arrangement.tracks.push({
				id: localId(),
				name: "Track 1",
				gain: 1,
				pan: 0,
				muted: false,
				solo: false,
				armed: true,
				input: { source: "mic", channel: "stereo" },
			});
		this.dirty = false;
		this.takeCount = song.sources.reduce((n, s) => Math.max(n, s.takeNumber), 0);
		const next: Record<string, StudioSource> = {};
		for (const s of song.sources) {
			next[s.id] = {
				id: s.id,
				label: s.trackLabel,
				durationSeconds: s.durationSeconds,
				sampleRate: s.sampleRate,
				channels: s.channels,
				peaks: Float32Array.from(s.peaks),
				status: "decoding",
				pending: false,
			};
		}
		this.sources = next;
		this.#ensureAllStrips();
		this.#applyGains(true);
		this.position = 0;
		this.#recount();
		// Decode in order, a few at a time.
		const queue = [...song.sources];
		this.decoding = queue.length;
		const worker = async () => {
			for (;;) {
				const s = queue.shift();
				if (!s) return;
				try {
					const res = await fetch(s.url);
					if (!res.ok) throw new Error(`${res.status}`);
					const buffer = await this.#decode(await res.arrayBuffer());
					if (!this.sources[s.id]) continue; // another song loaded meanwhile
					this.#buffers.set(s.id, buffer);
					const entry = this.sources[s.id];
					entry.status = "ready";
					entry.durationSeconds = buffer.duration;
					if (entry.peaks.length === 0) entry.peaks = computePeaks(buffer, 1024);
				} catch {
					if (this.sources[s.id]) this.sources[s.id].status = "failed";
				} finally {
					this.decoding--;
					this.#recount();
				}
			}
		};
		await Promise.all(Array.from({ length: LOAD_CONCURRENCY }, worker));
	}
	/** Decodes in the live context when open (its rate), else in a scratch one. */
	async #decode(bytes: ArrayBuffer): Promise<AudioBuffer> {
		if (this.#ctx) return this.#ctx.decodeAudioData(bytes);
		const scratch = new OfflineAudioContext(1, 1, 48000);
		return scratch.decodeAudioData(bytes);
	}
	#recount() {
		let bytes = 0;
		for (const b of this.#buffers.values()) bytes += b.length * b.numberOfChannels * 4;
		this.memoryBytes = bytes;
	}
	bufferOf(sourceId: string): AudioBuffer | null {
		return this.#buffers.get(sourceId) ?? null;
	}
	/** The queue finished uploading a take: the source is on the server under the same id. */
	markSourceSaved(sourceId: string) {
		const s = this.sources[sourceId];
		if (s) s.pending = false;
	}
	/** A source no clip uses any more, dropped from memory (and, by the page, from the server). */
	forgetSource(sourceId: string) {
		this.#buffers.delete(sourceId);
		const next = { ...this.sources };
		delete next[sourceId];
		this.sources = next;
		this.#recount();
	}
	/** Sources no clip refers to. */
	get unusedSources(): StudioSource[] {
		const used = new Set(this.arrangement.clips.map((c) => c.sourceId));
		return Object.values(this.sources).filter((s) => !used.has(s.id) && !s.pending);
	}

	// ── Edits (each snapshots for undo and marks the song dirty) ───────────
	#commit() {
		this.#past.push(structuredClone($state.snapshot(this.arrangement)));
		if (this.#past.length > UNDO_DEPTH) this.#past.shift();
		this.#future = [];
		this.canUndo = true;
		this.canRedo = false;
		this.dirty = true;
	}
	/** A mix move: the first change of a gesture snapshots for undo, the rest of the gesture rides on it. */
	#commitMixGesture() {
		if (this.#mixGestures.remember(() => null, performance.now())) this.#commit();
	}
	undo() {
		this.#mixGestures.clear();
		const prev = this.#past.pop();
		if (!prev) return;
		this.#future.push(structuredClone($state.snapshot(this.arrangement)));
		this.#restoreArrangement(prev);
	}
	redo() {
		this.#mixGestures.clear();
		const next = this.#future.pop();
		if (!next) return;
		this.#past.push(structuredClone($state.snapshot(this.arrangement)));
		this.#restoreArrangement(next);
	}
	#restoreArrangement(a: StudioArrangement) {
		const wasRunning = this.running;
		if (wasRunning) this.stop();
		this.arrangement = a;
		this.canUndo = this.#past.length > 0;
		this.canRedo = this.#future.length > 0;
		this.dirty = true;
		this.#ensureAllStrips();
		this.#masterStrip?.setInserts(a.masterInserts ?? [], 0);
		this.#applyGains(true);
		this.#settleAllAutomation();
		for (const t of a.tracks) this.#tracks.get(t.id)?.setInserts(insertsOf(t), 0);
		for (const b of a.buses ?? []) this.#buses.get(b.id)?.setInserts(insertsOf(b), 0);
	}
	/** A revision restored from the server replaces the arrangement outright (its own undo step). */
	replaceArrangement(a: StudioArrangement) {
		this.#commit();
		this.#restoreArrangement(structuredClone(a));
	}

	/** A track: audio by default, or a MIDI track (phase 3) whose input is the instrument that plays and records it (the piano when none is given). */
	addTrack(
		input: StudioInput | null = null,
		name?: string,
		kind: StudioTrackKind = "audio",
	): StudioTrack | null {
		if (this.arrangement.tracks.length >= MAX_STUDIO_TRACKS) {
			this.notice = `A song holds at most ${MAX_STUDIO_TRACKS} tracks.`;
			return null;
		}
		this.#commit();
		const n = this.arrangement.tracks.length + 1;
		const midi = kind === "midi";
		const track: StudioTrack = {
			id: localId(),
			...(midi ? { kind } : {}),
			name: name ?? (midi ? `MIDI ${n}` : `Track ${n}`),
			gain: 1,
			pan: 0,
			muted: false,
			solo: false,
			armed: false,
			input:
				midi && (!input || !isInstrument(input.source))
					? { source: "piano", channel: "stereo" }
					: input,
		};
		this.arrangement.tracks.push(track);
		this.#ensureTrackNodes(track.id);
		this.#routeAll();
		return track;
	}
	removeTrack(trackId: string) {
		this.#commit();
		this.#stopClipsOf(trackId);
		this.arrangement.clips = this.arrangement.clips.filter((c) => c.trackId !== trackId);
		this.arrangement.tracks = this.arrangement.tracks.filter((t) => t.id !== trackId);
		this.#dropTrackNodes(trackId);
		this.#applyGains();
	}
	renameTrack(trackId: string, name: string) {
		const t = this.#track(trackId);
		if (!t || t.name === name) return;
		this.#commit();
		t.name = name.trim().slice(0, 60);
	}
	moveTrack(trackId: string, index: number) {
		const from = this.arrangement.tracks.findIndex((t) => t.id === trackId);
		if (from < 0) return;
		this.#commit();
		const [t] = this.arrangement.tracks.splice(from, 1);
		this.arrangement.tracks.splice(
			Math.max(0, Math.min(this.arrangement.tracks.length, index)),
			0,
			t,
		);
	}
	#track(id: string) {
		return this.arrangement.tracks.find((t) => t.id === id) ?? null;
	}
	setGain(trackId: string, value: number) {
		const t = this.#track(trackId);
		if (!t) return;
		if (this.writeAutomation(trackId, "volume", value)) return;
		this.#commitMixGesture();
		t.gain = Math.max(0, Math.min(STUDIO_FADER_MAX, value));
		this.dirty = true;
		this.#applyGains();
	}
	/** A track's tint (constants/stemTints.ts), kept on the arrangement as `colour`; null for none. */
	setTint(trackId: string, tint: string | null) {
		const t = this.#track(trackId);
		if (!t) return;
		t.colour = tint ?? undefined;
		this.dirty = true;
	}
	setPan(trackId: string, value: number) {
		const t = this.#track(trackId);
		if (!t) return;
		if (this.writeAutomation(trackId, "pan", value)) return;
		this.#commitMixGesture();
		t.pan = Math.max(-1, Math.min(1, value));
		this.dirty = true;
		const nodes = this.#tracks.get(trackId);
		if (nodes && this.#ctx) nodes.pan.pan.setTargetAtTime(t.pan, this.#ctx.currentTime, RAMP);
	}
	/** A track's effects, live (a slider's run is one undo step, as a fader's). */
	setTrackFx(trackId: string, fx: StudioTrackFx) {
		const t = this.#track(trackId);
		if (!t) return;
		this.#commitMixGesture();
		t.fx = structuredClone(fx);
		this.dirty = true;
		this.#tracks.get(trackId)?.setInserts(insertsOf(t), 0.02);
		this.#afterLaneChange(trackId);
	}

	// ── Routing (docs/dawn-daw-plan.md, D2): inserts, buses, sends, the master chain ──
	/** A strip's inserts replaced whole (the panel's edits); `ownerId` names a track, a bus or "master". */
	setInserts(ownerId: string, inserts: StudioInsert[]) {
		const list = structuredClone(inserts);
		if (ownerId === "master") {
			this.#commitMixGesture();
			this.arrangement.masterInserts = list.length ? list : undefined;
			this.dirty = true;
			this.#masterStrip?.setInserts(list, 0.02);
			return;
		}
		const owner = this.#track(ownerId) ?? this.#bus(ownerId);
		if (!owner) return;
		this.#commitMixGesture();
		owner.inserts = list;
		this.dirty = true;
		(this.#tracks.get(ownerId) ?? this.#buses.get(ownerId))?.setInserts(list, 0.02);
		this.#afterLaneChange(ownerId);
	}
	/** A new bus, to the master; its id for the caller. */
	addBus(name = `Bus ${(this.arrangement.buses?.length ?? 0) + 1}`): string | null {
		if ((this.arrangement.buses?.length ?? 0) >= MAX_STUDIO_BUSES) return null;
		this.#commit();
		const bus: StudioBus = { id: newLocalId(), name, gain: 1, pan: 0, muted: false };
		this.arrangement.buses = [...(this.arrangement.buses ?? []), bus];
		this.#ensureBus(bus.id);
		this.#routeAll();
		return bus.id;
	}
	/** The bus goes; tracks routed to it go to the master, sends to it are dropped. */
	removeBus(busId: string) {
		if (!this.#bus(busId)) return;
		this.#commit();
		this.arrangement.buses = (this.arrangement.buses ?? []).filter((b) => b.id !== busId);
		for (const t of this.arrangement.tracks) {
			if (t.output === busId) t.output = undefined;
			if (t.sends?.some((s) => s.bus === busId)) t.sends = t.sends.filter((s) => s.bus !== busId);
		}
		this.#dropBus(busId);
		this.#routeAll();
	}
	renameBus(busId: string, name: string) {
		const b = this.#bus(busId);
		if (!b) return;
		this.#commit();
		b.name = name.trim().slice(0, 60) || b.name;
	}
	setBusGain(busId: string, value: number) {
		const b = this.#bus(busId);
		if (!b) return;
		if (this.writeAutomation(busId, "volume", value)) return;
		this.#commitMixGesture();
		b.gain = Math.max(0, Math.min(STUDIO_FADER_MAX, value));
		this.#applyGains();
	}
	setBusPan(busId: string, value: number) {
		const b = this.#bus(busId);
		if (!b) return;
		if (this.writeAutomation(busId, "pan", value)) return;
		this.#commitMixGesture();
		b.pan = Math.max(-1, Math.min(1, value));
		const strip = this.#buses.get(busId);
		if (strip && this.#ctx) strip.pan.pan.setTargetAtTime(b.pan, this.#ctx.currentTime, RAMP);
	}
	toggleBusMute(busId: string) {
		const b = this.#bus(busId);
		if (!b) return;
		this.#commitMixGesture();
		b.muted = !b.muted;
		this.#applyGains();
	}
	setBusTint(busId: string, tint: string | null) {
		const b = this.#bus(busId);
		if (!b) return;
		b.colour = tint ?? undefined;
		this.dirty = true;
	}
	/** Where a track goes: a bus, or the master with null. */
	setOutput(trackId: string, busId: string | null) {
		const t = this.#track(trackId);
		if (!t || (busId && !this.#bus(busId))) return;
		this.#commit();
		t.output = busId ?? undefined;
		this.#routeAll();
	}
	/** A track's send to a bus at a level (0 removes it), post-fader unless `pre`. */
	setSend(trackId: string, busId: string, level: number, pre?: boolean) {
		const t = this.#track(trackId);
		if (!t || !this.#bus(busId)) return;
		const key = sendLaneKey(busId);
		if (
			level > 0 &&
			t.sends?.some((s) => s.bus === busId) &&
			this.writeAutomation(trackId, key, level)
		)
			return;
		this.#commitMixGesture();
		const rest = (t.sends ?? []).filter((s) => s.bus !== busId);
		const was = t.sends?.find((s) => s.bus === busId);
		t.sends =
			level > 0 ? [...rest, { bus: busId, level: Math.min(1, level), pre: pre ?? was?.pre }] : rest;
		if (t.sends.length === 0) t.sends = undefined;
		if (level <= 0 && t.automation?.[key]) {
			const { [key]: _gone, ...lanes } = t.automation;
			t.automation = Object.keys(lanes).length ? lanes : undefined;
		}
		this.dirty = true;
		this.#routeAll();
	}
	toggleMute(trackId: string) {
		const t = this.#track(trackId);
		if (!t) return;
		this.#commitMixGesture();
		t.muted = !t.muted;
		this.dirty = true;
		this.#applyGains();
	}
	toggleSolo(trackId: string) {
		const t = this.#track(trackId);
		if (!t) return;
		this.#commitMixGesture();
		t.solo = !t.solo;
		this.dirty = true;
		this.#applyGains();
	}
	toggleArm(trackId: string) {
		const t = this.#track(trackId);
		if (!t || this.recording) return;
		t.armed = !t.armed;
		if (t.armed && !t.input) t.input = { source: "mic", channel: "stereo" };
		this.dirty = true;
	}
	setInput(trackId: string, input: StudioInput | null) {
		const t = this.#track(trackId);
		if (!t || this.recording) return;
		t.input = input;
		this.dirty = true;
	}
	setMaster(value: number) {
		this.#commitMixGesture();
		this.arrangement.master = Math.max(0, Math.min(1, value));
		this.dirty = true;
		if (this.#masterStrip && this.#ctx)
			this.#masterStrip.fader.gain.setTargetAtTime(
				this.arrangement.master,
				this.#ctx.currentTime,
				RAMP,
			);
	}
	setBpm(bpm: number) {
		if (!Number.isFinite(bpm)) return;
		const v = Math.max(30, Math.min(300, Math.round(bpm)));
		if (v === this.arrangement.bpm) return;
		this.#commit();
		this.arrangement.bpm = v;
		metronome.setBpm(v);
	}
	setBeatsPerBar(n: number) {
		if (!Number.isFinite(n)) return;
		const v = Math.max(2, Math.min(7, Math.round(n)));
		if (v === this.arrangement.beatsPerBar) return;
		this.#commit();
		this.arrangement.beatsPerBar = v;
		metronome.setBeats(v);
	}
	setGridOn(on: boolean) {
		this.arrangement.gridOn = on;
		this.dirty = true;
	}
	setCountIn(on: boolean) {
		this.arrangement.countIn = on;
		this.dirty = true;
	}
	setClick(on: boolean) {
		this.arrangement.click = on;
		this.dirty = true;
		if (!on && this.phase === "playing") metronome.stop();
	}
	setLoop(loop: StudioArrangement["loop"]) {
		this.#commit();
		this.arrangement.loop =
			loop && loop.end > loop.start + 0.05 ? { ...loop } : loop ? { ...loop, on: false } : null;
	}
	toggleLoop() {
		const loop = this.arrangement.loop;
		if (!loop) {
			// No region yet: a bar from the playhead on the grid, else the whole song.
			const start = this.arrangement.gridOn ? this.snap(this.position) : 0;
			const end = this.arrangement.gridOn
				? start + this.barSeconds
				: Math.max(start + 1, this.duration);
			this.setLoop({ on: true, start, end });
			return;
		}
		this.arrangement.loop = { ...loop, on: !loop.on };
		this.dirty = true;
	}

	/** A time on the grid (the nearest beat) when the grid is on; the time itself otherwise. */
	snap(seconds: number): number {
		return snapToGrid(seconds, { on: this.arrangement.gridOn, bpm: this.arrangement.bpm });
	}

	addClip(clip: Omit<StudioClip, "id">): StudioClip | null {
		if (this.arrangement.clips.length >= MAX_STUDIO_CLIPS) {
			this.notice = `A song holds at most ${MAX_STUDIO_CLIPS} clips.`;
			return null;
		}
		this.#commit();
		const c = { ...clip, id: localId() };
		this.arrangement.clips.push(c);
		return c;
	}
	moveClip(clipId: string, start: number, trackId?: string) {
		const c = this.arrangement.clips.find((x) => x.id === clipId);
		if (!c) return;
		const to = Math.max(0, start);
		const track = trackId ?? c.trackId;
		if (c.start === to && c.trackId === track) return;
		this.#commit();
		c.start = Math.round(to * 10000) / 10000;
		c.trackId = track;
		this.#reschedule();
	}
	deleteClip(clipId: string) {
		if (!this.arrangement.clips.some((c) => c.id === clipId)) return;
		this.#commit();
		this.arrangement.clips = this.arrangement.clips.filter((c) => c.id !== clipId);
		this.#stopClip(clipId);
	}
	renameClip(clipId: string, name: string) {
		const c = this.arrangement.clips.find((x) => x.id === clipId);
		if (!c) return;
		this.#commit();
		c.name = name.trim().slice(0, 60);
	}
	#clip(id: string) {
		return this.arrangement.clips.find((x) => x.id === id) ?? null;
	}
	/** How long a clip's source runs, for the bounds of a trim. */
	#sourceSeconds(c: StudioClip) {
		if (c.notes) {
			// A MIDI clip's content runs to its last note, or as far as it is shown.
			let end = 0;
			for (const n of c.notes) end = Math.max(end, n.t + n.d);
			return Math.max(end, c.offset + c.duration);
		}
		return (c.sourceId && this.sources[c.sourceId]?.durationSeconds) || c.offset + c.duration;
	}
	/**
	 * Trim: a new left edge moves `start` and `offset` together (no earlier
	 * than the source's own start), a new right edge sets the duration (no
	 * later than the source's end). A clip keeps at least 10 ms.
	 */
	trimClip(clipId: string, edges: { start?: number; end?: number }) {
		const c = this.#clip(clipId);
		if (!c) return;
		const next = trimmedClip(c, edges, this.#sourceSeconds(c));
		if (!next) return;
		this.#commit();
		Object.assign(c, next);
		this.#reschedule();
	}
	/** Split at a time inside the clip: the clip keeps what is before, a new one takes the rest (the fade-out goes with it). Returns the new clip. */
	splitClip(clipId: string, at: number): StudioClip | null {
		const c = this.#clip(clipId);
		if (!c) return null;
		const parts = splitClipAt(structuredClone($state.snapshot(c)), at);
		if (!parts) return null;
		if (this.arrangement.clips.length >= MAX_STUDIO_CLIPS) {
			this.notice = `A song holds at most ${MAX_STUDIO_CLIPS} clips.`;
			return null;
		}
		this.#commit();
		Object.assign(c, parts.left);
		const right: StudioClip = { ...parts.right, id: localId() };
		const i = this.arrangement.clips.findIndex((x) => x.id === clipId);
		this.arrangement.clips.splice(i + 1, 0, right);
		this.#reschedule();
		return right;
	}
	setClipGain(clipId: string, gain: number) {
		const c = this.#clip(clipId);
		if (!c) return;
		const g = Math.max(0, Math.min(2, gain));
		if (g === c.gain) return;
		this.#commit();
		c.gain = g;
		this.#reschedule();
	}
	setClipFades(clipId: string, fades: { fadeIn?: number; fadeOut?: number }) {
		const c = this.#clip(clipId);
		if (!c) return;
		const half = c.duration / 2;
		const fadeIn =
			fades.fadeIn === undefined ? c.fadeIn : Math.max(0, Math.min(half, fades.fadeIn));
		const fadeOut =
			fades.fadeOut === undefined ? c.fadeOut : Math.max(0, Math.min(half, fades.fadeOut));
		if (fadeIn === c.fadeIn && fadeOut === c.fadeOut) return;
		this.#commit();
		c.fadeIn = round4(fadeIn);
		c.fadeOut = round4(fadeOut);
		this.#reschedule();
	}
	/** A copy of the clip right after it (snapped to the grid when on). Returns the copy. */
	duplicateClip(clipId: string): StudioClip | null {
		const c = this.#clip(clipId);
		if (!c) return null;
		if (this.arrangement.clips.length >= MAX_STUDIO_CLIPS) {
			this.notice = `A song holds at most ${MAX_STUDIO_CLIPS} clips.`;
			return null;
		}
		this.#commit();
		const copy: StudioClip = {
			...structuredClone($state.snapshot(c)),
			id: localId(),
			start: round4(this.snap(c.start + c.duration)),
		};
		this.arrangement.clips.push(copy);
		this.#reschedule();
		return copy;
	}
	/** Take lanes: the clip swaps to the next (or previous) of its takes; the one it leaves joins the alternates. */
	cycleTake(clipId: string, step: 1 | -1) {
		const c = this.#clip(clipId);
		if (!c || !c.sourceId || !c.alternates?.length) return;
		this.#commit();
		const ring = [c.sourceId, ...c.alternates];
		const next = step === 1 ? ring[1] : ring[ring.length - 1];
		c.alternates = ring.filter((id) => id !== next);
		c.sourceId = next;
		const srcEnd = this.#sourceSeconds(c);
		if (c.offset >= srcEnd) c.offset = 0;
		c.duration = round4(Math.min(c.duration, srcEnd - c.offset));
		this.#reschedule();
	}
	/** How many takes a clip holds (the chosen one included). */
	takesOf(clipId: string) {
		const c = this.#clip(clipId);
		return c ? 1 + (c.alternates?.length ?? 0) : 0;
	}
	setPunch(on: boolean) {
		this.arrangement.punch = on;
		this.dirty = true;
	}

	// ── MIDI clips (phase 3) ───────────────────────────────────────────────
	/** The notes' starts onto the grid: every `division` of a beat (1 = the beat, 2 = half, 4 = a quarter) at the song's tempo. */
	quantizeClip(clipId: string, division: 1 | 2 | 4 = 1) {
		const c = this.#clip(clipId);
		if (!c?.notes?.length) return;
		this.#commit();
		c.notes = quantizeNotes(c.notes, {
			origin: 0,
			step: this.beatSeconds / division,
			contentOrigin: c.start - c.offset,
		});
		this.#reschedule();
	}
	/** A MIDI clip's notes replaced outright (the piano-roll editor's edits), sorted and capped, as one undo step. */
	setClipNotes(clipId: string, notes: StudioNote[]) {
		const c = this.#clip(clipId);
		if (!c?.notes) return;
		this.#commit();
		c.notes = notes
			.slice(0, MAX_STUDIO_NOTES_PER_CLIP)
			.map((n) => ({ ...n }))
			.sort((a, b) => a.t - b.t || a.p - b.p);
		this.#reschedule();
	}
	/** One note sounded now through a MIDI track's instrument (the roll's click and the keyboard column). */
	auditionNote(trackId: string, pitch: number, velocity = 0.8, duration = 0.3) {
		const t = this.#track(trackId);
		const source = t?.input?.source;
		const ctx = this.#ctx;
		if (!source || !isInstrument(source) || !ctx) return;
		if (source === "drums") {
			const voice = DRUM_MIDI_IN_NOTES[pitch];
			if (voice) void drumMachine.hit(voice, velocity);
			return;
		}
		const engine = source === "piano" ? piano : chordPiano;
		engine.warm();
		engine.scheduleNote(pitch, velocity, ctx.currentTime + 0.01, duration);
	}
	/** Every note up or down by `semitones`, within the MIDI range. */
	transposeClip(clipId: string, semitones: number) {
		const c = this.#clip(clipId);
		if (!c?.notes?.length || !semitones) return;
		this.#commit();
		c.notes = c.notes.map((n) => ({ ...n, p: Math.max(0, Math.min(127, n.p + semitones)) }));
		this.#reschedule();
	}
	/** A parsed MIDI file onto a MIDI track at `start`, as one clip the length of its notes. */
	importMidi(
		track: StudioTrack,
		summary: MidiSummary,
		start: number,
		name: string,
	): StudioClip | null {
		const notes = notesFromMidiSummary(summary);
		if (notes.length === 0) {
			this.notice = `${name} holds no notes.`;
			return null;
		}
		let end = 0;
		for (const n of notes) end = Math.max(end, n.t + n.d);
		return this.addClip({
			trackId: track.id,
			notes,
			start: round4(start),
			offset: 0,
			duration: round4(Math.max(0.01, end)),
			gain: 1,
			fadeIn: 0,
			fadeOut: 0,
			name: name.replace(/\.[a-z0-9]+$/i, "").slice(0, 60) || "MIDI",
		});
	}
	/** A MIDI clip's notes (what the clip shows of them) as a Standard MIDI File at the song's tempo. */
	midiBlobOf(clipId: string): Blob | null {
		const c = this.#clip(clipId);
		if (!c?.notes) return null;
		const track = this.#track(c.trackId);
		return notesToMidiBlob(sliceNotes(c.notes, c.offset, c.offset + c.duration), {
			bpm: this.arrangement.bpm,
			beatsPerBar: this.arrangement.beatsPerBar,
			drums: track?.input?.source === "drums",
		});
	}
	/** The MIDI tracks that hold notes: what a bounce renders to audio first. */
	get midiTracksWithClips(): StudioTrack[] {
		return this.arrangement.tracks.filter(
			(t) => t.kind === "midi" && this.arrangement.clips.some((c) => c.trackId === t.id && c.notes),
		);
	}
	/** A MIDI clip for a take on a track: clips the take covers end to end are replaced (no alternate takes for notes). */
	#landMidiClip(
		track: StudioTrack,
		notes: StudioNote[],
		start: number,
		duration: number,
		name: string,
	) {
		const { covered } = coveredClips(this.arrangement.clips, {
			trackId: track.id,
			start,
			duration,
		});
		if (covered.length) {
			const gone = new Set(covered.map((x) => x.id));
			for (const id of gone) this.#stopClip(id);
			this.arrangement.clips = this.arrangement.clips.filter((x) => !gone.has(x.id));
		}
		this.arrangement.clips.push({
			id: localId(),
			trackId: track.id,
			notes,
			start: round4(start),
			offset: 0,
			duration: round4(duration),
			gain: 1,
			fadeIn: 0,
			fadeOut: 0,
			name,
		});
	}
	/**
	 * A MIDI track rendered to audio (docs/multitrack-recorder.md, phase 3):
	 * an audio track with the same instrument as its input is added and
	 * armed alone, the MIDI track soloed, and the song recorded from the
	 * start to the track's last note in real time (no count-in, no latency
	 * shift: the part is played by the clock, not by hand); the MIDI track
	 * is then muted. Answers the audio track, or null when there was
	 * nothing to render or the transport was busy.
	 */
	async renderMidiTrack(trackId: string): Promise<StudioTrack | null> {
		const track = this.#track(trackId);
		if (!track || track.kind !== "midi" || !track.input || this.running) return null;
		const clips = this.arrangement.clips.filter((c) => c.trackId === trackId && c.notes?.length);
		if (clips.length === 0) return null;
		let end = 0;
		for (const c of clips) end = Math.max(end, c.start + c.duration);
		const audio = this.addTrack(
			{ source: track.input.source, channel: "stereo" },
			`${track.name} (audio)`,
		);
		if (!audio) return null;
		const a = this.arrangement;
		const before = {
			states: a.tracks.map((t) => ({ id: t.id, armed: t.armed, solo: t.solo })),
			countIn: a.countIn,
			loop: a.loop ? { ...a.loop } : null,
			punch: a.punch,
			compensate: this.compensateInstruments,
			position: this.position,
		};
		for (const t of a.tracks) {
			t.armed = t.id === audio.id;
			t.solo = t.id === trackId || t.id === audio.id;
		}
		a.countIn = false;
		if (a.loop) a.loop.on = false;
		a.punch = false;
		this.compensateInstruments = false;
		this.#freezing = true;
		this.position = 0;
		try {
			if (!(await this.record())) return null;
			await new Promise<void>((resolve) => {
				const check = () => {
					if (!this.running) return resolve();
					if (this.position >= end + 0.5) {
						this.stop(0);
						return resolve();
					}
					setTimeout(check, 50);
				};
				check();
			});
			// The take lands once the capture worklet has handed over its last chunk.
			const landed = () => a.clips.some((c) => c.trackId === audio.id);
			for (let i = 0; i < 60 && !landed(); i++) await new Promise((r) => setTimeout(r, 50));
			if (!landed()) return null;
			const midi = this.#track(trackId);
			if (midi) midi.muted = true;
			return this.#track(audio.id);
		} finally {
			for (const st of before.states) {
				const t = this.#track(st.id);
				if (t) {
					t.armed = st.armed;
					t.solo = st.solo;
				}
			}
			a.countIn = before.countIn;
			a.loop = before.loop;
			a.punch = before.punch;
			this.compensateInstruments = before.compensate;
			this.#freezing = false;
			this.position = before.position;
			this.dirty = true;
			this.#applyGains(true);
		}
	}
	/**
	 * A clip for a new take on a track: clips of the track the take covers
	 * end to end are replaced, their sources kept as the new clip's
	 * alternate takes (a part recorded again, a loop pass over the last one).
	 */
	#landClip(track: StudioTrack, sourceId: string, start: number, duration: number, name: string) {
		const { covered, alternates } = coveredClips(this.arrangement.clips, {
			trackId: track.id,
			start,
			duration,
		});
		if (covered.length) {
			const gone = new Set(covered.map((x) => x.id));
			for (const id of gone) this.#stopClip(id);
			this.arrangement.clips = this.arrangement.clips.filter((x) => !gone.has(x.id));
		}
		this.arrangement.clips.push({
			id: localId(),
			trackId: track.id,
			sourceId,
			start: round4(start),
			offset: 0,
			duration: round4(duration),
			gain: 1,
			fadeIn: 0,
			fadeOut: 0,
			name,
			...(alternates.length ? { alternates } : {}),
		});
	}
	/** A decoded audio file onto a track at `start` (the page uploads the file as the source). */
	importBuffer(
		track: StudioTrack,
		buffer: AudioBuffer,
		file: { blob: Blob; filename: string },
		start: number,
	): StudioTake | null {
		if (this.arrangement.clips.length >= MAX_STUDIO_CLIPS) {
			this.notice = `A song holds at most ${MAX_STUDIO_CLIPS} clips.`;
			return null;
		}
		const sourceId = nanoid();
		const label = file.filename.replace(/\.[a-z0-9]+$/i, "").slice(0, 60) || "Import";
		this.#buffers.set(sourceId, buffer);
		this.sources[sourceId] = {
			id: sourceId,
			label,
			durationSeconds: buffer.duration,
			sampleRate: buffer.sampleRate,
			channels: buffer.numberOfChannels,
			peaks: computePeaks(buffer, 1024),
			status: "ready",
			pending: true,
		};
		this.#recount();
		this.#commit();
		this.arrangement.clips.push({
			id: localId(),
			trackId: track.id,
			sourceId,
			start: round4(start),
			offset: 0,
			duration: round4(buffer.duration),
			gain: 1,
			fadeIn: 0,
			fadeOut: 0,
			name: label,
		});
		this.#reschedule();
		return {
			sourceId,
			trackId: track.id,
			trackLabel: label,
			takeNumber: 0,
			kind: "import",
			buffer,
			blob: file.blob,
			filename: file.filename,
			durationSeconds: buffer.duration,
		};
	}
	/** The file decoded in the engine's context (its rate), for an import. */
	async decodeFile(bytes: ArrayBuffer): Promise<AudioBuffer> {
		await this.open();
		return this.#decode(bytes);
	}

	// ── Gains ──────────────────────────────────────────────────────────────
	#effectiveGain(track: StudioTrack) {
		const anySolo = this.arrangement.tracks.some((t) => t.solo);
		if (track.muted || (anySolo && !track.solo)) return 0;
		// A track armed for a punch over its own clips can be silenced while recording.
		if (this.recording && track.armed && !this.playArmed) return 0;
		// With a volume lane the lane is the level (the `auto` node); the fader node keeps mute and solo alone.
		return track.automation?.volume?.length ? 1 : track.gain;
	}
	#busGain(bus: StudioBus) {
		if (bus.muted) return 0;
		return bus.automation?.volume?.length ? 1 : bus.gain;
	}
	/** Whether a parameter of a track is driven by a lane (docs/dawn-daw-plan.md, D1). */
	/** Whether a parameter of a strip is driven by a lane (docs/dawn-daw-plan.md, D1 and D2); `ownerId` a track's or a bus's. */
	hasAutomation(ownerId: string, key: string): boolean {
		const owner = this.#track(ownerId) ?? this.#bus(ownerId);
		return !!owner?.automation?.[key]?.length;
	}
	/**
	 * A parameter as it sounds at `seconds` (the playhead): the lane's value
	 * there, else the static one. The knobs and the Stage show this while a
	 * lane drives.
	 */
	/**
	 * A parameter as it sounds at `seconds` (the playhead): the lane's value
	 * there, else the static one (utils/automationLanes.ts says which). The
	 * knobs, the console and the Stage show this while a lane drives.
	 */
	automatedValue(ownerId: string, key: string, seconds = this.position): number {
		const owner = this.#track(ownerId) ?? this.#bus(ownerId);
		if (!owner) return 0;
		const choice = this.lanesOf(ownerId).find((l) => l.key === key);
		const fallback = choice?.fallback ?? 0;
		const lane = owner.automation?.[key];
		return lane?.length ? automationValueAt(lane, seconds, fallback) : fallback;
	}
	/** The lanes a strip can show (utils/automationLanes.ts), from its state now. */
	lanesOf(ownerId: string) {
		const track = this.#track(ownerId);
		const owner = track ?? this.#bus(ownerId);
		if (!owner) return [];
		return automationLanes({
			gain: owner.gain,
			pan: owner.pan,
			sends: track?.sends,
			inserts: insertsOf(owner),
			buses: track ? (this.arrangement.buses ?? []) : [],
		});
	}
	/** The lane's params as the graph has them, with the static value each falls back to and the lane's scale onto the param. */
	/** The strip's lanes scheduled for a pass: song second `from` at context time `when`, to `to` (null: the end). */
	#scheduleLanes(
		owner: { automation?: StudioAutomation },
		strip: StripGraph,
		from: number,
		when: number,
		to: number | null,
	) {
		for (const [key, lane] of Object.entries(owner.automation ?? {})) {
			const param = strip.param(key);
			if (param && lane.length) scheduleAutomation(param, lane, { from, when, to, fallback: 0 });
		}
	}
	/** The lanes of a track scheduled for a pass: song second `from` at context time `when`, to `to` (null: the end). */
	/** The lanes at rest: every curve canceled and each param at its value for the playhead (or its static value without a lane). */
	/**
	 * The strip's lanes at rest (a stop, a seek, an edit while stopped):
	 * every curve canceled, the statics put back (the fader's unity on the
	 * volume node, the pan, the sends, the inserts' settings), then each
	 * lane's param at its value for the playhead.
	 */
	#settleAutomation(
		owner: {
			gain: number;
			pan: number;
			automation?: StudioAutomation;
			sends?: StudioSend[];
			inserts?: StudioInsert[];
			fx?: StudioTrackFx;
		},
		strip: StripGraph,
		now: number,
	) {
		const lanes = owner.automation ?? {};
		strip.auto.gain.cancelScheduledValues(now);
		strip.pan.pan.cancelScheduledValues(now);
		if (!lanes.volume?.length) strip.auto.gain.setValueAtTime(1, now);
		if (!lanes.pan?.length) strip.pan.pan.setValueAtTime(owner.pan, now);
		for (const [busId, gain] of strip.sends) {
			gain.gain.cancelScheduledValues(now);
			if (lanes[sendLaneKey(busId)]?.length) continue;
			gain.gain.setValueAtTime(owner.sends?.find((s) => s.bus === busId)?.level ?? 0, now);
		}
		strip.setInserts(insertsOf(owner), 0);
		for (const [key, lane] of Object.entries(lanes)) {
			const param = strip.param(key);
			if (!param || !lane.length) continue;
			param.cancelScheduledValues(now);
			param.setValueAtTime(automationValueAt(lane, this.position, 0), now);
		}
	}
	/** Every track's lanes settled (a stop, a seek, an edit while stopped). */
	/** Every strip's lanes settled (a stop, a seek, an edit while stopped). */
	#settleAllAutomation() {
		const ctx = this.#ctx;
		if (!ctx) return;
		for (const t of this.arrangement.tracks) {
			const strip = this.#tracks.get(t.id);
			if (strip) this.#settleAutomation(t, strip, ctx.currentTime);
		}
		for (const b of this.arrangement.buses ?? []) {
			const strip = this.#buses.get(b.id);
			if (strip) this.#settleAutomation(b, strip, ctx.currentTime);
		}
	}

	/** A lane replaced whole (the lane component's gesture), one undo step; an empty lane is removed. */
	/** A lane replaced whole (the lane component's gesture), one undo step; an empty lane is removed. `ownerId` a track's or a bus's. */
	setAutomation(ownerId: string, key: string, points: StudioAutomationPoint[]) {
		const owner = this.#track(ownerId) ?? this.#bus(ownerId);
		if (!owner) return;
		this.#commit();
		const automation = { ...owner.automation };
		if (points.length) automation[key] = points;
		else delete automation[key];
		owner.automation = Object.keys(automation).length ? automation : undefined;
		this.#afterLaneChange(ownerId);
	}
	/** A knob touched on a track with a lane: a point at the playhead takes the value (docs/dawn-daw-plan.md, D1: touch write). */
	/** A knob touched on a strip whose lane exists: a point at the playhead takes the value (docs/dawn-daw-plan.md, D1: touch write). */
	writeAutomation(ownerId: string, key: string, value: number) {
		const owner = this.#track(ownerId) ?? this.#bus(ownerId);
		const lane = owner?.automation?.[key];
		if (!owner || !lane?.length) return false;
		const range = this.lanesOf(ownerId).find((l) => l.key === key)?.range;
		if (!range) return false;
		this.#commitMixGesture();
		const edited = editAutomation(lane, { kind: "add", t: this.position, v: value }, range);
		owner.automation = { ...owner.automation, [key]: edited.points };
		this.#afterLaneChange(ownerId);
		return true;
	}
	#afterLaneChange(ownerId: string) {
		this.dirty = true;
		const ctx = this.#ctx;
		const owner = this.#track(ownerId) ?? this.#bus(ownerId);
		const strip = this.#tracks.get(ownerId) ?? this.#buses.get(ownerId);
		if (!ctx || !owner || !strip) return;
		this.#applyGains();
		if (this.running) {
			// The pass under way carries on with the new lane from here.
			const pass = this.#passes.findLast((p) => p.when <= ctx.currentTime) ?? this.#passes[0];
			if (pass) {
				const now = ctx.currentTime + 0.01;
				this.#settleAutomation(owner, strip, now);
				this.#scheduleLanes(owner, strip, pass.from + (now - pass.when), now, pass.to);
			}
		} else this.#settleAutomation(owner, strip, ctx.currentTime);
	}
	#applyGains(immediate = false) {
		const ctx = this.#ctx;
		if (!ctx) return;
		const set = (param: AudioParam, g: number) => {
			if (immediate) param.value = g;
			else param.setTargetAtTime(g, ctx.currentTime, RAMP);
		};
		for (const t of this.arrangement.tracks) {
			const strip = this.#tracks.get(t.id);
			if (strip) set(strip.fader.gain, this.#effectiveGain(t));
		}
		for (const b of this.arrangement.buses ?? []) {
			const strip = this.#buses.get(b.id);
			if (strip) set(strip.fader.gain, this.#busGain(b));
		}
		if (this.#masterStrip) set(this.#masterStrip.fader.gain, this.arrangement.master);
	}

	// ── Transport ──────────────────────────────────────────────────────────
	/** Play from the playhead (or `from`), after a count-in when `countIn` asks for one. */
	async play(opts: { from?: number; countIn?: boolean; ahead?: number } = {}): Promise<void> {
		if (this.running) return;
		await this.open();
		const ctx = this.#ctx!;
		claimPlayback(this.#transport);
		// The instruments MIDI clips play through must be awake before their first note is due.
		const midiSources = new Set(
			this.midiTracksWithClips.map((t) => t.input!.source as StudioInstrument),
		);
		if (midiSources.has("drums")) await drumMachine.readyKit();
		if (midiSources.has("piano")) {
			piano.load();
			piano.warm();
		}
		if (midiSources.has("chords")) {
			chordPiano.load();
			chordPiano.warm();
		}
		const from = opts.from ?? this.position;
		const ahead = opts.ahead ?? START_AHEAD;
		const countIn = opts.countIn ? this.barSeconds : 0;
		const when = ctx.currentTime + ahead + countIn;
		this.#stopAt = from;
		this.#passes = [];
		this.#startPass(from, when);
		// A drums track armed: the drum machine plays along from the start, at the song's tempo, in step (its beat is recorded when recording). Not for a MIDI drums track (its notes play the drums), nor while a MIDI track renders to audio.
		if (
			!this.#freezing &&
			this.armedTracks.some((t) => t.kind !== "midi" && t.input?.source === "drums")
		) {
			drumMachine.load();
			if (drumMachine.running) drumMachine.stop();
			if (!drumMachine.followTempo) drumMachine.setBpm(this.arrangement.bpm);
			void drumMachine.startAt(when);
			this.#startedDrums = true;
		}
		if (this.arrangement.click || opts.countIn) {
			metronome.setBpm(this.arrangement.bpm);
			metronome.setBeats(this.arrangement.beatsPerBar);
			// The click runs from the count-in; on the grid its downbeats fall on the song's bars.
			const bar = this.barSeconds;
			const firstBeat = opts.countIn ? when - countIn : when - (from % bar);
			void metronome.startAt(firstBeat >= ctx.currentTime ? firstBeat : firstBeat + bar);
			if (!this.arrangement.click) {
				this.#metronomeStopTimer = setTimeout(
					() => metronome.stop(),
					(ahead + countIn) * 1000 + 30,
				);
			}
		}
		this.phase = countIn > 0 ? "counting" : "playing";
		this.#stopLookahead = startLookahead(ctx, this.#queueUntil);
		this.#follow();
	}
	/** Every clip that sounds in [from, loop end or the song's end), started together at `when`. */
	#startPass(from: number, when: number) {
		const loop = this.arrangement.loop;
		const to = loop?.on && from < loop.end ? loop.end : null;
		this.#passes.push({ from, when, to });
		for (const t of this.arrangement.tracks) {
			const strip = this.#tracks.get(t.id);
			if (strip) this.#scheduleLanes(t, strip, from, when, to);
		}
		for (const b of this.arrangement.buses ?? []) {
			const strip = this.#buses.get(b.id);
			if (strip) this.#scheduleLanes(b, strip, from, when, to);
		}
		for (const clip of this.arrangement.clips) this.#startClip(clip, from, when, to);
		this.#queueMidi(from, when, to);
	}
	/** Every note of every MIDI clip that falls in [from, to), queued for the look-ahead from `when`; the first moments fire now. */
	#queueMidi(from: number, when: number, to: number | null) {
		const ctx = this.#ctx;
		if (!ctx) return;
		const queue: QueuedNote[] = [];
		for (const clip of this.arrangement.clips) {
			if (!clip.notes?.length) continue;
			const track = this.#track(clip.trackId);
			const source = track?.input?.source;
			if (!track || track.kind !== "midi" || !source || !isInstrument(source)) continue;
			const clipEnd = clip.start + clip.duration;
			const ends = to === null ? clipEnd : Math.min(clipEnd, to);
			const origin = clip.start - clip.offset;
			for (const n of clip.notes) {
				const tt = origin + n.t;
				if (tt < clip.start || tt < from || tt >= ends) continue;
				const duration = Math.min(n.d, ends - tt);
				const at = when + (tt - from);
				queue.push({
					at,
					clipId: clip.id,
					fired: false,
					fire: () => {
						const t = this.#track(track.id);
						const gain = t ? this.#effectiveGain(t) : 0;
						if (gain <= 0) return null;
						const velocity = Math.min(1, n.v * clip.gain * Math.min(1, gain));
						if (source === "drums") {
							const voice = DRUM_MIDI_IN_NOTES[n.p];
							return voice ? drumMachine.scheduleHit(voice, velocity, at) : null;
						}
						return (source === "piano" ? piano : chordPiano).scheduleNote(
							n.p,
							velocity,
							at,
							duration,
						);
					},
				});
			}
		}
		queue.sort((a, b) => a.at - b.at);
		this.#midiQueue = queue;
		this.#midiNext = 0;
		this.#flushMidi(ctx.currentTime + 0.1);
	}
	/** Fires the queued notes due before `until`, and forgets the voices that have ended. */
	#flushMidi(until: number) {
		const ctx = this.#ctx;
		if (!ctx) return;
		const q = this.#midiQueue;
		while (this.#midiNext < q.length && q[this.#midiNext].at < until) {
			const e = q[this.#midiNext++];
			if (e.fired) continue;
			e.fired = true;
			const cancel = e.fire();
			if (cancel) this.#midiVoices.push({ clipId: e.clipId, ends: e.at + 30, cancel });
		}
		if (this.#midiVoices.length > 64)
			this.#midiVoices = this.#midiVoices.filter((v) => v.ends > ctx.currentTime);
	}
	#startClip(clip: StudioClip, from: number, when: number, to: number | null) {
		const ctx = this.#ctx;
		if (!clip.sourceId) return; // a MIDI clip: its notes are queued by #queueMidi
		const buffer = this.#buffers.get(clip.sourceId);
		const nodes = this.#tracks.get(clip.trackId);
		if (!ctx || !buffer || !nodes) return;
		const clipEnd = clip.start + clip.duration;
		if (clipEnd <= from || (to !== null && clip.start >= to)) return;
		const begins = Math.max(clip.start, from);
		const ends = to === null ? clipEnd : Math.min(clipEnd, to);
		const offset = clip.offset + (begins - clip.start);
		const length = ends - begins;
		if (length <= 0 || offset >= buffer.duration) return;
		const src = ctx.createBufferSource();
		src.buffer = buffer;
		const gain = ctx.createGain();
		src.connect(gain);
		gain.connect(nodes.input);
		const at = when + (begins - from);
		const g = clip.gain;
		// Fades: the clip's own at its edges, else a few milliseconds so a cut never clicks.
		const fadeIn = begins === clip.start ? Math.max(EDGE_FADE, clip.fadeIn) : EDGE_FADE;
		const fadeOut = ends === clipEnd ? Math.max(EDGE_FADE, clip.fadeOut) : EDGE_FADE;
		gain.gain.setValueAtTime(0, at);
		gain.gain.linearRampToValueAtTime(g, at + Math.min(fadeIn, length / 2));
		gain.gain.setValueAtTime(g, at + length - Math.min(fadeOut, length / 2));
		gain.gain.linearRampToValueAtTime(0, at + length);
		src.start(at, offset, Math.min(length, buffer.duration - offset));
		const entry: Playing = { clipId: clip.id, src, gain };
		src.onended = () => {
			this.#playing = this.#playing.filter((p) => p !== entry);
			gain.disconnect();
		};
		this.#playing.push(entry);
	}
	/** The look-ahead: when a loop pass ends within reach, the next pass is already queued. */
	#queueUntil = (until: number) => {
		this.#flushMidi(until);
		const loop = this.arrangement.loop;
		const last = this.#passes[this.#passes.length - 1];
		if (!loop?.on || !last || last.to === null) return;
		const passEnd = last.when + (last.to - last.from);
		if (passEnd <= until) this.#startPass(loop.start, passEnd);
	};
	/** The playhead from the context clock: the pass under way and how far into it. */
	#currentPosition(): number {
		const ctx = this.#ctx;
		if (!ctx || this.#passes.length === 0) return this.position;
		const now = ctx.currentTime;
		let pass = this.#passes[0];
		for (const p of this.#passes) if (p.when <= now) pass = p;
		return pass.from + Math.max(0, now - pass.when);
	}
	#follow() {
		const tick = () => {
			if (!this.running) return;
			const p = this.#currentPosition();
			this.position = p;
			// Past the last clip and not looping, the transport parks (recording keeps going).
			if (
				this.phase === "playing" &&
				!this.arrangement.loop?.on &&
				p >= Math.max(this.duration, 0.1) + 0.05
			) {
				this.stop(this.duration);
				return;
			}
			if (this.phase === "counting" && this.#ctx && this.#passes[0]?.when <= this.#ctx.currentTime)
				this.phase = this.#captures.length || this.#midiCaptures.length ? "recording" : "playing";
			this.#frame = requestAnimationFrame(tick);
		};
		this.#frame = requestAnimationFrame(tick);
	}
	#stopSources() {
		for (const p of this.#playing) {
			try {
				p.src.onended = null;
				p.src.stop();
			} catch {
				// Already stopped.
			}
			p.gain.disconnect();
		}
		this.#playing = [];
		this.#passes = [];
		for (const v of this.#midiVoices) v.cancel();
		this.#midiVoices = [];
		this.#midiQueue = [];
		this.#midiNext = 0;
		piano.cancelScheduled();
		chordPiano.cancelScheduled();
	}
	#stopClip(clipId: string) {
		for (const p of this.#playing.filter((x) => x.clipId === clipId)) {
			try {
				p.src.onended = null;
				p.src.stop();
			} catch {
				// Already stopped.
			}
			p.gain.disconnect();
		}
		this.#playing = this.#playing.filter((x) => x.clipId !== clipId);
		for (const v of this.#midiVoices.filter((x) => x.clipId === clipId)) v.cancel();
		this.#midiVoices = this.#midiVoices.filter((x) => x.clipId !== clipId);
		this.#midiQueue = this.#midiQueue.filter((e) => e.clipId !== clipId);
		const next = this.#midiQueue.findIndex((e) => !e.fired);
		this.#midiNext = next < 0 ? this.#midiQueue.length : next;
	}
	#stopClipsOf(trackId: string) {
		for (const c of this.arrangement.clips) if (c.trackId === trackId) this.#stopClip(c.id);
	}
	/** An edit while playing: everything from the playhead on starts again from here (a clip moved under the playhead sounds at once). */
	#reschedule() {
		if (this.phase !== "playing" || !this.#ctx) return;
		const at = this.#currentPosition();
		this.#stopSources();
		this.#startPass(at, this.#ctx.currentTime + 0.02);
	}
	/** Pause where it is. */
	pause() {
		if (!this.running) return;
		const at = this.#currentPosition();
		this.#halt();
		this.position = at;
	}
	/** Stop: back to where play began (a DAW's stop), or to `at`. */
	stop(at?: number) {
		if (!this.running) return;
		this.#halt();
		this.position = at ?? this.#stopAt;
	}
	#halt() {
		const hadAudio = this.#captures.length > 0;
		if (hadAudio) void this.#finishCaptures();
		if (this.#midiCaptures.length) this.#finishMidiCaptures(hadAudio);
		this.#stopSources();
		this.#stopLookahead?.();
		this.#stopLookahead = null;
		if (this.#metronomeStopTimer) clearTimeout(this.#metronomeStopTimer);
		this.#metronomeStopTimer = null;
		metronome.stop();
		if (this.#startedDrums) {
			drumMachine.stop();
			this.#startedDrums = false;
		}
		cancelAnimationFrame(this.#frame);
		this.phase = "idle";
		releasePlayback(this.#transport);
		this.#applyGains();
		this.#settleAllAutomation();
	}
	toggle() {
		if (this.running) this.stop();
		else void this.play();
	}
	seek(seconds: number) {
		const to = Math.max(0, seconds);
		if (this.phase === "recording" || this.phase === "counting") return;
		if (this.phase === "playing" && this.#ctx) {
			this.#stopSources();
			this.#stopAt = to;
			this.#startPass(to, this.#ctx.currentTime + 0.02);
			this.position = to;
			return;
		}
		this.position = to;
	}
	/** To the start, or to the loop's start when looping. */
	rewind() {
		const loop = this.arrangement.loop;
		this.seek(loop?.on ? loop.start : 0);
	}

	// ── Recording ──────────────────────────────────────────────────────────
	/**
	 * Record: the armed tracks capture from the playhead (after the count-in)
	 * while everything else plays. Each armed track's input must be open
	 * (the page asks for the microphone on arming); a track without one is
	 * skipped. Stop ends every take at once.
	 */
	async record(): Promise<boolean> {
		if (this.running) return false;
		await this.open();
		const ctx = this.#ctx!;
		const armed = this.armedTracks.filter((t) => t.input && this.inputOpen(t.input.source));
		if (armed.length === 0) {
			this.notice = "Arm a track with an open input to record.";
			return false;
		}
		// The drums must be ready to start on the bar: the kit decoded before the start is chosen.
		if (armed.some((t) => t.input?.source === "drums")) await drumMachine.readyKit();
		const midiArmed = armed.filter((t) => t.kind === "midi");
		if (midiArmed.some((t) => t.input?.source === "piano")) {
			piano.load();
			piano.warm();
		}
		if (midiArmed.some((t) => t.input?.source === "chords")) {
			chordPiano.load();
			chordPiano.warm();
		}
		const session = audioSession();
		if (session) session.type = "play-and-record";
		const from = this.position;
		const countIn = this.arrangement.countIn;
		// The lead-in must fit before the start: the count-in gives it; without one the start waits for it.
		const ahead = countIn ? START_AHEAD : LEAD_SECONDS + 0.05;
		this.recordFrom = from;
		this.#captures = [];
		this.#midiCaptures = [];
		for (const track of armed) {
			if (track.kind === "midi") this.#armMidi(track);
			else this.#arm(track, ctx);
		}
		await this.play({ from, countIn, ahead });
		const when = this.#passes[0]?.when ?? ctx.currentTime + ahead;
		const startFrame = Math.round(when * ctx.sampleRate);
		const lead = Math.round(LEAD_SECONDS * ctx.sampleRate);
		for (const cap of this.#captures)
			cap.node.port.postMessage({ type: "arm", startFrame, lead, channels: cap.channels });
		if (this.phase === "playing") this.phase = "recording";
		this.#applyGains();
		return true;
	}
	/** An input's node in this context: an instrument's master, or the shared input's gain stage. */
	#inputNode(source: StudioInputSource): AudioNode | null {
		if (source === "piano") return piano.output();
		if (source === "chords") return chordPiano.output();
		if (source === "drums") return drumMachine.output();
		if (source === "amp") return amp.on ? amp.output() : null;
		return inputSources.output(source);
	}
	#arm(track: StudioTrack, ctx: AudioContext) {
		const input = track.input!;
		const source = this.#inputNode(input.source);
		if (!source) return;
		const channels = input.channel === "stereo" ? 2 : 1;
		const node = new AudioWorkletNode(ctx, "track-capture", {
			numberOfInputs: 1,
			numberOfOutputs: 1,
			outputChannelCount: [1],
			channelCount: channels,
			channelCountMode: "explicit",
		});
		const feed: AudioNode[] = [];
		if (channels === 2) {
			source.connect(node);
		} else {
			const splitter = ctx.createChannelSplitter(2);
			source.connect(splitter);
			splitter.connect(node, input.channel === "left" ? 0 : 1, 0);
			feed.push(splitter);
		}
		// A silent path into the destination: a node nothing pulls is not rendered in every browser.
		const sink = ctx.createGain();
		sink.gain.value = 0;
		node.connect(sink);
		sink.connect(ctx.destination);
		feed.push(sink);
		const chunks: Float32Array[][] = [];
		let finish!: () => void;
		const done = new Promise<void>((resolve) => (finish = resolve));
		// The live waveform: the chunk reduced to a peak per LIVE_PEAK_FRAMES, the lead-in skipped so the band starts where the clip will.
		const lead = Math.round(LEAD_SECONDS * ctx.sampleRate);
		const live = chunkPeaksState();
		this.#livePeaks.set(track.id, live.peaks);
		node.port.onmessage = (e) => {
			const m = e.data as { type: string; channels?: Float32Array[] };
			if (m.type === "chunk" && m.channels) {
				chunks.push(m.channels);
				appendChunkPeaks(live, m.channels, { binFrames: LIVE_PEAK_FRAMES, skipFrames: lead });
				this.liveTick++;
			} else if (m.type === "done") finish();
		};
		this.#captures.push({ trackId: track.id, node, feed, chunks, channels, done, finish });
	}
	/** A MIDI track armed: the instrument's notes are collected as they come (the keys, the computer keyboard, a MIDI device, the pads), each stamped by the context's clock. */
	#armMidi(track: StudioTrack) {
		const source = track.input?.source;
		if (!source || !isInstrument(source)) return;
		const events: NoteEvent[] = [];
		const push = (e: NoteEvent) => {
			events.push(e);
			this.liveTick++;
		};
		const off =
			source === "drums"
				? drumMachine.onHit((h) => {
						// A hit has no length of its own: a tenth of a second, the pad's blink.
						const pitch = DRUM_GM_NOTES[h.voice];
						push({ on: true, pitch, velocity: h.velocity, time: h.time });
						push({ on: false, pitch, velocity: 0, time: h.time + 0.1 });
					})
				: (source === "piano" ? piano : chordPiano).onNote(push);
		this.#midiCaptures.push({ trackId: track.id, source, events, off });
	}
	/**
	 * The notes of each MIDI capture as clips: paired from the pass's start
	 * (less the output latency when instrument takes are shifted: the part
	 * was played by hand against what was heard), then cut per loop pass or
	 * to the punch region as audio takes are, one clip per piece. A pass
	 * with no notes lands nothing.
	 */
	#finishMidiCaptures(withAudio: boolean) {
		const caps = this.#midiCaptures;
		this.#midiCaptures = [];
		const ctx = this.#ctx;
		const when = this.#passes[0]?.when;
		for (const cap of caps) cap.off();
		if (!ctx || when === undefined) return;
		const end = ctx.currentTime;
		const from = this.recordFrom;
		// A pass with audio takes too shares their number (the audio path counts it once its chunks are in).
		const takeNumber = withAudio ? this.takeCount + 1 : ++this.takeCount;
		// Shifted earlier by the output latency, as an audio instrument take is, and no further than one could be.
		const shift = this.compensateInstruments
			? Math.min(LEAD_SECONDS, this.outputLatencyMs / 1000)
			: 0;
		let landed = false;
		for (const cap of caps) {
			const track = this.#track(cap.trackId);
			if (!track || cap.events.length === 0) continue;
			const notes = pairNoteEvents(cap.events, { from: when, shift, end });
			const pieces = takePieces({
				from,
				duration: Math.max(0.01, end - when - shift),
				loop: this.arrangement.loop,
				punch: this.arrangement.punch ?? false,
			});
			const label = track.name;
			pieces.forEach((piece, k) => {
				const part = sliceNotes(notes, piece.from, piece.to);
				if (part.length === 0) return;
				if (!landed) this.#commit();
				landed = true;
				const name =
					pieces.length > 1
						? `${label} · Take ${takeNumber}.${k + 1}`
						: `${label} · Take ${takeNumber}`;
				this.#landMidiClip(track, part, piece.start, piece.to - piece.from, name);
			});
		}
		this.liveTick++;
		if (landed) this.dirty = true;
	}
	async #finishCaptures() {
		const caps = this.#captures;
		this.#captures = [];
		const ctx = this.#ctx;
		if (!ctx) return;
		for (const cap of caps) cap.node.port.postMessage({ type: "stop" });
		await Promise.all(
			caps.map((c) => Promise.race([c.done, new Promise((r) => setTimeout(r, 1500))])),
		);
		const takeNumber = ++this.takeCount;
		const from = this.recordFrom;
		for (const cap of caps) {
			try {
				cap.node.port.onmessage = null;
				cap.node.disconnect();
				for (const n of cap.feed) n.disconnect();
				this.#inputNode(this.#track(cap.trackId)?.input?.source ?? "mic")?.disconnect(cap.node);
			} catch {
				// Already gone.
			}
			for (const take of this.#takesFrom(cap, ctx, from, takeNumber)) this.ontake?.(take);
		}
		this.#livePeaks.clear();
		this.liveTick++;
		if (caps.length && this.arrangement.tracks.some((t) => t.armed)) this.dirty = true;
	}
	/**
	 * The chunks of one capture, less the lead-in and the input's latency,
	 * as sources and clips: one take from where recording began; cut to the
	 * loop region when Punch is on; or, looping, one take per full pass of
	 * the region, the last pass the clip and the others its alternates.
	 */
	#takesFrom(cap: Capture, ctx: AudioContext, from: number, takeNumber: number): StudioTake[] {
		const track = this.#track(cap.trackId);
		const total = cap.chunks.reduce((n, c) => n + (c[0]?.length ?? 0), 0);
		const lead = Math.round(LEAD_SECONDS * ctx.sampleRate);
		const input = track?.input;
		// A microphone or line in (and the amp, which is one of them through its chain) by its measured round trip; the computer by its capture delay; a piano or chords part played by hand against what is heard by the output latency; the drums' beat runs on the clock and needs none.
		const shiftMs =
			input?.source === "computer"
				? inputSources.computerLatencyMs
				: input?.source === "piano" || input?.source === "chords"
					? this.compensateInstruments
						? this.outputLatencyMs
						: 0
					: input?.source === "drums"
						? 0
						: inputSources.latencyMs;
		const shift = Math.min(lead, Math.round((shiftMs / 1000) * ctx.sampleRate));
		const skip = lead + shift;
		const frames = total - skip;
		if (frames < ctx.sampleRate * 0.25 || !track) return [];
		const whole = ctx.createBuffer(cap.channels, frames, ctx.sampleRate);
		for (let c = 0; c < cap.channels; c++) {
			const out = whole.getChannelData(c);
			let at = 0;
			for (const chunk of cap.chunks) {
				const data = chunk[c] ?? chunk[0];
				const end = at + data.length;
				if (end > skip) {
					const a = Math.max(0, skip - at);
					out.set(data.subarray(a), at + a - skip);
				}
				at = end;
			}
		}
		if (inputSources.normalize) normalizeBuffer(whole);
		const label = track.name;
		const pieces = takePieces({
			from,
			duration: whole.duration,
			loop: this.arrangement.loop,
			punch: this.arrangement.punch ?? false,
		});
		if (pieces.length === 0) return [];
		const takes: StudioTake[] = [];
		this.#commit();
		pieces.forEach((piece, k) => {
			const buffer =
				pieces.length === 1 && piece.from === 0 && piece.to === whole.duration
					? whole
					: sliceBuffer(ctx, whole, piece.from, piece.to);
			const sourceId = nanoid();
			this.#buffers.set(sourceId, buffer);
			this.sources[sourceId] = {
				id: sourceId,
				label,
				durationSeconds: buffer.duration,
				sampleRate: buffer.sampleRate,
				channels: buffer.numberOfChannels,
				peaks: computePeaks(buffer, 1024),
				status: "ready",
				pending: true,
			};
			const name =
				pieces.length > 1
					? `${label} · Take ${takeNumber}.${k + 1}`
					: `${label} · Take ${takeNumber}`;
			this.#landClip(track, sourceId, piece.start, buffer.duration, name);
			takes.push({
				sourceId,
				trackId: track.id,
				trackLabel: label,
				takeNumber,
				kind: "take",
				buffer,
				blob: new Blob(
					[
						encodeWav24(
							Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c)),
							buffer.sampleRate,
						),
					],
					{ type: "audio/wav" },
				),
				filename: `${label.toLowerCase() || "take"}.wav`,
				durationSeconds: buffer.duration,
			});
		});
		this.#recount();
		return takes;
	}

	// ── Meters ─────────────────────────────────────────────────────────────
	#meterFrame = 0;
	#meterAt = 0;
	#meter = () => {
		const buf = this.#meterBuf;
		if (!this.#ctx || !buf) return;
		const now = performance.now();
		const dt = Math.min(0.1, (now - this.#meterAt) / 1000);
		this.#meterAt = now;
		const t = now / 1000;
		const next: Record<string, MeterState> = {};
		for (const [id, strip] of [...this.#tracks, ...this.#buses]) {
			const read = this.running ? readOf(strip.meter, buf) : NO_READ;
			next[id] = nextMeter(this.levels[id] ?? METER_ZERO, read.peak, t, dt, read.rms);
		}
		this.levels = next;
		const master =
			this.running && this.#masterStrip ? readOf(this.#masterStrip.meter, buf) : NO_READ;
		this.masterLevel = nextMeter(this.masterLevel, master.peak, t, dt, master.rms);
		this.#meterFrame = requestAnimationFrame(this.#meter);
	};

	/** Forget a track's clip (or every track's and the master's, with no id); the lights go out. */
	resetClips(trackId?: string) {
		const next: Record<string, MeterState> = {};
		for (const [k, v] of Object.entries(this.levels))
			next[k] = trackId === undefined || k === trackId ? { ...v, clipped: false } : v;
		this.levels = next;
		if (trackId === undefined) this.masterLevel = { ...this.masterLevel, clipped: false };
	}

	// ── Bounce ─────────────────────────────────────────────────────────────
	/** The song rendered offline with every track's fader, pan, mute and solo, or one track alone (`trackId`) with its own settings. */
	async render(trackId: string | null = null): Promise<AudioBuffer> {
		const sampleRate = this.sampleRate;
		const length = Math.max(1, Math.ceil(this.duration * sampleRate));
		const off = new OfflineAudioContext(2, length, sampleRate);
		// The master, the buses and the tracks as the live graph has them (stripGraph.ts), the lanes from the song's start.
		const master = createStripGraph(off, {
			inserts: trackId ? [] : (this.arrangement.masterInserts ?? []),
			pan: 0,
		});
		master.fader.gain.value = trackId ? 1 : this.arrangement.master;
		master.route(off.destination);
		const busInputs = new Map<string, AudioNode>();
		if (!trackId)
			for (const b of this.arrangement.buses ?? []) {
				const strip = createStripGraph(off, { inserts: insertsOf(b), pan: b.pan });
				strip.fader.gain.value = this.#busGain(b);
				strip.route(master.input);
				busInputs.set(b.id, strip.input);
				this.#scheduleLanes(b, strip, 0, 0, null);
			}
		const nodes = new Map<string, GainNode>();
		for (const t of this.arrangement.tracks) {
			if (trackId && t.id !== trackId) continue;
			const g = trackId ? t.gain : this.#effectiveGain(t);
			if (g <= 0) continue;
			const strip = createStripGraph(off, { inserts: insertsOf(t), pan: t.pan });
			strip.fader.gain.value = trackId && t.automation?.volume?.length ? 1 : g;
			strip.route((t.output && busInputs.get(t.output)) || master.input);
			if (!trackId) strip.setSends(t.sends ?? [], busInputs, 0);
			this.#scheduleLanes(t, strip, 0, 0, null);
			nodes.set(t.id, strip.input);
		}
		for (const clip of this.arrangement.clips) {
			// A MIDI clip has no audio of its own: the page renders its track to audio first (renderMidiTrack).
			if (!clip.sourceId) continue;
			const buffer = this.#buffers.get(clip.sourceId);
			const into = nodes.get(clip.trackId);
			if (!buffer || !into) continue;
			const src = off.createBufferSource();
			src.buffer = buffer;
			const gain = off.createGain();
			src.connect(gain).connect(into);
			const at = clip.start;
			const len = Math.min(clip.duration, Math.max(0, buffer.duration - clip.offset));
			if (len <= 0) continue;
			const fadeIn = Math.min(Math.max(EDGE_FADE, clip.fadeIn), len / 2);
			const fadeOut = Math.min(Math.max(EDGE_FADE, clip.fadeOut), len / 2);
			gain.gain.setValueAtTime(0, at);
			gain.gain.linearRampToValueAtTime(clip.gain, at + fadeIn);
			gain.gain.setValueAtTime(clip.gain, at + len - fadeOut);
			gain.gain.linearRampToValueAtTime(0, at + len);
			src.start(at, clip.offset, len);
		}
		return off.startRendering();
	}
	/** Any buffer as a 24-bit WAV blob. */
	wavOf(buffer: AudioBuffer): Blob {
		const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) =>
			buffer.getChannelData(c),
		);
		return new Blob([encodeWav24(channels, buffer.sampleRate)], { type: "audio/wav" });
	}

	/** What the engine holds, for a diagnostic (the dev server's e2e scripts). */
	diagnostics() {
		const ctx = this.#ctx;
		return {
			context: ctx ? { state: ctx.state, time: ctx.currentTime, sampleRate: ctx.sampleRate } : null,
			tracks: Array.from(this.#tracks.keys()),
			playing: this.#playing.length,
			passes: this.#passes.length,
			buffers: Array.from(this.#buffers.keys()),
			master: this.#masterStrip?.fader.gain.value ?? null,
			buses: Array.from(this.#buses.keys()),
			midiQueued: this.#midiQueue.length - this.#midiNext,
			midiVoices: this.#midiVoices.length,
			midiCaptures: this.#midiCaptures.length,
		};
	}
	/** Open the microphone or the line in for a track's input (from a gesture); an instrument is always open once hosted. */
	async requestInput(source: StudioInputSource): Promise<boolean> {
		await this.open();
		if (isInstrument(source)) return true;
		if (source === "amp") {
			await amp.setOn(true);
			return amp.on;
		}
		if (source === "computer") return inputSources.requestComputer();
		return inputSources.requestInput(source);
	}
	/** Whether a track's input can be recorded now. */
	inputOpen(source: StudioInputSource): boolean {
		if (source === "amp") return amp.on;
		return isInstrument(source) || inputSources.has(source);
	}
	dispose() {
		this.stop();
		cancelAnimationFrame(this.#frame);
		cancelAnimationFrame(this.#meterFrame);
		inputSources.detach(this.#ctx ?? undefined);
		void this.#ctx?.close();
		this.#ctx = null;
		this.ready = false;
	}
}

const round4 = (x: number) => Math.round(x * 10000) / 10000;
const NO_READ = { peak: 0, rms: 0 };
/** The analyser's latest frame's peak and RMS, linear (the meters show the peak on a dB scale; the Stage's halo breathes with the RMS). */
function readOf(analyser: AnalyserNode, buf: Float32Array<ArrayBuffer>) {
	analyser.getFloatTimeDomainData(buf);
	let peak = 0;
	let sq = 0;
	for (const x of buf) {
		const v = Math.abs(x);
		if (v > peak) peak = v;
		sq += x * x;
	}
	return { peak, rms: Math.sqrt(sq / buf.length) };
}
export const studio = new StudioEngine();
