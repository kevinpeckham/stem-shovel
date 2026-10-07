import { audioSession } from "$lib/utils/audioSession";
import { appendChunkPeaks, chunkPeaksState } from "$lib/utils/chunkPeaks";
import { coveredClips } from "$lib/utils/coveredClips";
import { encodeWav24 } from "$lib/utils/encodeWav24";
import { normalizeBuffer } from "$lib/utils/normalizeBuffer";
import { sliceBuffer } from "$lib/utils/sliceBuffer";
import { snapToGrid } from "$lib/utils/snapToGrid";
import { splitClipAt } from "$lib/utils/splitClipAt";
import { takePieces } from "$lib/utils/takePieces";
import { trimmedClip } from "$lib/utils/trimmedClip";
import { MAX_STUDIO_CLIPS, MAX_STUDIO_TRACKS, STUDIO_FADER_MAX } from "$lib/constants/studio";
import type {
	StudioArrangement,
	StudioClip,
	StudioInput,
	StudioInputSource,
	StudioSourceView,
	StudioTrack,
} from "$lib/val/StudioSchema";
import { nanoid } from "nanoid";
import { drumMachine } from "./drumMachine.svelte";
import { inputSources, outputLatencyMs } from "./inputs.svelte";
import { chordPiano, piano } from "./piano.svelte";
import { startLookahead } from "./lookahead";
import { metronome } from "./metronome.svelte";
import { claimPlayback, releasePlayback } from "./onlyOnePlays";
import { computePeaks } from "./peaks";
import { playThroughSilentSwitch } from "./playThroughSilentSwitch";

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

interface TrackNodes {
	gain: GainNode;
	panner: StereoPannerNode;
	analyser: AnalyserNode;
}
interface Playing {
	clipId: string;
	src: AudioBufferSourceNode;
	gain: GainNode;
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
	/** Each track's level for its meter, 0 to 1. */
	levels = $state<Record<string, number>>({});
	masterLevel = $state(0);
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
	#master: GainNode | null = null;
	#masterAnalyser: AnalyserNode | null = null;
	#buffers = new Map<string, AudioBuffer>();
	#tracks = new Map<string, TrackNodes>();
	#playing: Playing[] = [];
	/** Each pass under way: the timeline second it began at and the context time it began on. */
	#passes: { from: number; when: number; to: number | null }[] = [];
	#stopLookahead: (() => void) | null = null;
	#frame = 0;
	#meterBuf: Float32Array<ArrayBuffer> | null = null;
	#captures: Capture[] = [];
	#past: StudioArrangement[] = [];
	#future: StudioArrangement[] = [];
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
		if (ctx.state !== "running") await ctx.resume().catch(() => {});
		const master = ctx.createGain();
		master.gain.value = this.arrangement.master;
		const analyser = ctx.createAnalyser();
		analyser.fftSize = 1024;
		master.connect(analyser);
		master.connect(ctx.destination);
		this.#master = master;
		this.#masterAnalyser = analyser;
		this.#meterBuf = new Float32Array(1024);
		for (const t of this.arrangement.tracks) this.#ensureTrackNodes(t.id);
		this.#attachInputs();
		this.outputLatencyMs = outputLatencyMs(ctx);
		cancelAnimationFrame(this.#meterFrame);
		this.#meter();
		this.ready = true;
		// Sources already loaded (before a gesture) decoded in a scratch context at their own rate; the live context resamples on play.
	}
	#attachInputs() {
		const ctx = this.#ctx;
		if (!ctx || !this.#master) return;
		inputSources.attach(ctx, {
			monitorOut: this.#master,
			onsource: () => {
				// A device change while armed: the capture re-feeds on the next record.
			},
		});
	}
	#ensureTrackNodes(trackId: string): TrackNodes | null {
		const ctx = this.#ctx;
		if (!ctx || !this.#master) return null;
		let nodes = this.#tracks.get(trackId);
		if (nodes) return nodes;
		const gain = ctx.createGain();
		const panner = ctx.createStereoPanner();
		const analyser = ctx.createAnalyser();
		analyser.fftSize = 1024;
		gain.connect(panner);
		panner.connect(analyser);
		panner.connect(this.#master);
		nodes = { gain, panner, analyser };
		this.#tracks.set(trackId, nodes);
		const track = this.arrangement.tracks.find((t) => t.id === trackId);
		if (track) {
			gain.gain.value = this.#effectiveGain(track);
			panner.pan.value = track.pan;
		}
		return nodes;
	}
	#dropTrackNodes(trackId: string) {
		const nodes = this.#tracks.get(trackId);
		if (!nodes) return;
		nodes.gain.disconnect();
		nodes.panner.disconnect();
		nodes.analyser.disconnect();
		this.#tracks.delete(trackId);
	}

	// ── Loading ────────────────────────────────────────────────────────────
	/** A song from the page: its arrangement and its sources, fetched and decoded three at a time. */
	async load(song: { current: StudioArrangement | null; sources: StudioSourceView[] }) {
		this.stop();
		this.#past = [];
		this.#future = [];
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
		for (const t of this.arrangement.tracks) this.#ensureTrackNodes(t.id);
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
	undo() {
		const prev = this.#past.pop();
		if (!prev) return;
		this.#future.push(structuredClone($state.snapshot(this.arrangement)));
		this.#restoreArrangement(prev);
	}
	redo() {
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
		for (const id of Array.from(this.#tracks.keys()))
			if (!a.tracks.some((t) => t.id === id)) this.#dropTrackNodes(id);
		for (const t of a.tracks) this.#ensureTrackNodes(t.id);
		this.#applyGains(true);
	}
	/** A revision restored from the server replaces the arrangement outright (its own undo step). */
	replaceArrangement(a: StudioArrangement) {
		this.#commit();
		this.#restoreArrangement(structuredClone(a));
	}

	addTrack(input: StudioInput | null = null, name?: string): StudioTrack | null {
		if (this.arrangement.tracks.length >= MAX_STUDIO_TRACKS) {
			this.notice = `A song holds at most ${MAX_STUDIO_TRACKS} tracks.`;
			return null;
		}
		this.#commit();
		const n = this.arrangement.tracks.length + 1;
		const track: StudioTrack = {
			id: localId(),
			name: name ?? `Track ${n}`,
			gain: 1,
			pan: 0,
			muted: false,
			solo: false,
			armed: false,
			input,
		};
		this.arrangement.tracks.push(track);
		this.#ensureTrackNodes(track.id);
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
		t.gain = Math.max(0, Math.min(STUDIO_FADER_MAX, value));
		this.dirty = true;
		this.#applyGains();
	}
	setPan(trackId: string, value: number) {
		const t = this.#track(trackId);
		if (!t) return;
		t.pan = Math.max(-1, Math.min(1, value));
		this.dirty = true;
		const nodes = this.#tracks.get(trackId);
		if (nodes && this.#ctx) nodes.panner.pan.setTargetAtTime(t.pan, this.#ctx.currentTime, RAMP);
	}
	toggleMute(trackId: string) {
		const t = this.#track(trackId);
		if (!t) return;
		t.muted = !t.muted;
		this.dirty = true;
		this.#applyGains();
	}
	toggleSolo(trackId: string) {
		const t = this.#track(trackId);
		if (!t) return;
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
		this.arrangement.master = Math.max(0, Math.min(1, value));
		this.dirty = true;
		if (this.#master && this.#ctx)
			this.#master.gain.setTargetAtTime(this.arrangement.master, this.#ctx.currentTime, RAMP);
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
		return this.sources[c.sourceId]?.durationSeconds ?? c.offset + c.duration;
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
		if (!c || !c.alternates?.length) return;
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
		return track.gain;
	}
	#applyGains(immediate = false) {
		const ctx = this.#ctx;
		if (!ctx) return;
		for (const t of this.arrangement.tracks) {
			const nodes = this.#tracks.get(t.id);
			if (!nodes) continue;
			const g = this.#effectiveGain(t);
			if (immediate) nodes.gain.gain.value = g;
			else nodes.gain.gain.setTargetAtTime(g, ctx.currentTime, RAMP);
		}
	}

	// ── Transport ──────────────────────────────────────────────────────────
	/** Play from the playhead (or `from`), after a count-in when `countIn` asks for one. */
	async play(opts: { from?: number; countIn?: boolean; ahead?: number } = {}): Promise<void> {
		if (this.running) return;
		await this.open();
		const ctx = this.#ctx!;
		claimPlayback(this.#transport);
		const from = opts.from ?? this.position;
		const ahead = opts.ahead ?? START_AHEAD;
		const countIn = opts.countIn ? this.barSeconds : 0;
		const when = ctx.currentTime + ahead + countIn;
		this.#stopAt = from;
		this.#passes = [];
		this.#startPass(from, when);
		// A drums track armed: the drum machine plays along from the start, at the song's tempo, in step (its beat is recorded when recording).
		if (this.armedTracks.some((t) => t.input?.source === "drums")) {
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
		for (const clip of this.arrangement.clips) this.#startClip(clip, from, when, to);
	}
	#startClip(clip: StudioClip, from: number, when: number, to: number | null) {
		const ctx = this.#ctx;
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
		gain.connect(nodes.gain);
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
				this.phase = this.#captures.length ? "recording" : "playing";
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
		if (this.#captures.length) void this.#finishCaptures();
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
		const armed = this.armedTracks.filter(
			(t) => t.input && (isInstrument(t.input.source) || inputSources.has(t.input.source)),
		);
		if (armed.length === 0) {
			this.notice = "Arm a track with an open input to record.";
			return false;
		}
		// The drums must be ready to start on the bar: the kit decoded before the start is chosen.
		if (armed.some((t) => t.input?.source === "drums")) await drumMachine.readyKit();
		const session = audioSession();
		if (session) session.type = "play-and-record";
		const from = this.position;
		const countIn = this.arrangement.countIn;
		// The lead-in must fit before the start: the count-in gives it; without one the start waits for it.
		const ahead = countIn ? START_AHEAD : LEAD_SECONDS + 0.05;
		this.recordFrom = from;
		this.#captures = [];
		for (const track of armed) this.#arm(track, ctx);
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
		// A microphone or line in by its measured round trip; the computer by its capture delay; a piano or chords part played by hand against what is heard by the output latency; the drums' beat runs on the clock and needs none.
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
	#meter = () => {
		const buf = this.#meterBuf;
		if (!this.#ctx || !buf) return;
		const next: Record<string, number> = {};
		let changed = Object.keys(this.levels).length !== this.#tracks.size;
		for (const [id, nodes] of this.#tracks) {
			const level = this.running ? rms(nodes.analyser, buf) : 0;
			next[id] = level;
			if (level !== this.levels[id]) changed = true;
		}
		if (changed) this.levels = next;
		const master = this.running && this.#masterAnalyser ? rms(this.#masterAnalyser, buf) : 0;
		if (master !== this.masterLevel) this.masterLevel = master;
		this.#meterFrame = requestAnimationFrame(this.#meter);
	};

	// ── Bounce ─────────────────────────────────────────────────────────────
	/** The song rendered offline with every track's fader, pan, mute and solo, or one track alone (`trackId`) with its own settings. */
	async render(trackId: string | null = null): Promise<AudioBuffer> {
		const sampleRate = this.sampleRate;
		const length = Math.max(1, Math.ceil(this.duration * sampleRate));
		const off = new OfflineAudioContext(2, length, sampleRate);
		const master = off.createGain();
		master.gain.value = trackId ? 1 : this.arrangement.master;
		master.connect(off.destination);
		const nodes = new Map<string, GainNode>();
		for (const t of this.arrangement.tracks) {
			if (trackId && t.id !== trackId) continue;
			const g = trackId ? t.gain : this.#effectiveGain(t);
			if (g <= 0) continue;
			const gain = off.createGain();
			gain.gain.value = g;
			const panner = off.createStereoPanner();
			panner.pan.value = t.pan;
			gain.connect(panner).connect(master);
			nodes.set(t.id, gain);
		}
		for (const clip of this.arrangement.clips) {
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
			master: this.#master?.gain.value ?? null,
		};
	}
	/** Open the microphone or the line in for a track's input (from a gesture); an instrument is always open once hosted. */
	async requestInput(source: StudioInputSource): Promise<boolean> {
		await this.open();
		if (isInstrument(source)) return true;
		if (source === "computer") return inputSources.requestComputer();
		return inputSources.requestInput(source);
	}
	/** Whether a track's input can be recorded now. */
	inputOpen(source: StudioInputSource): boolean {
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
function rms(analyser: AnalyserNode, buf: Float32Array<ArrayBuffer>) {
	analyser.getFloatTimeDomainData(buf);
	let sum = 0;
	for (const x of buf) sum += x * x;
	return Math.min(1, Math.sqrt(sum / buf.length) * 3);
}
export const studio = new StudioEngine();
