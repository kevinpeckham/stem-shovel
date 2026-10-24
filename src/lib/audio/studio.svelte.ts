import { resampleBuffer } from "./resampleBuffer.js";
import { songSampleRate } from "#lib/utils/songSampleRate.js";
import { METER_ZERO, nextMeter, type MeterState } from "#lib/utils/meterLevel.js";
import { kWeighting, lufsOf } from "#lib/utils/measureLoudness.js";
import { LOUDNESS_ABSOLUTE_GATE_LUFS } from "#lib/constants/loudness.js";
import { renderMidiClipsOffline } from "./midiRender";
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
import { snapToBeat } from "#lib/utils/snapToBeat.js";
import { studioGrid } from "#lib/utils/studioGrid.js";
import { studioKeyAt } from "#lib/utils/studioChanges.js";
import { swingNotes } from "#lib/utils/swingNotes.js";
import { clipNoteEvents } from "#lib/utils/clipNoteEvents.js";
import { clipSegments, type ClipSegment } from "#lib/utils/clipSegments.js";
import { detectTempo } from "#lib/utils/detectTempo.js";
import { stretchChannels } from "#lib/utils/stretchChannels.js";
import { resampleChannels, semitonesFactor } from "#lib/utils/resampleChannels.js";
import {
	barAt,
	nextBeatAt,
	barSecondsAt,
	beatsPerBarAt,
	beatTempoAt,
	beatUnitAt,
	secondsAtBar,
	tempoAt,
	type BarGrid,
} from "./measures";
import { BEAT_UNITS } from "#lib/constants/studio.js";
import { retimeClip } from "#lib/utils/retimeClip.js";
import { busDescendants } from "#lib/utils/busDescendants.js";
import { stemTintHex } from "#lib/constants/stemTints.js";
import type { BeatUnit } from "#lib/val/StudioSchema.js";
import { splitClipAt } from "#lib/utils/splitClipAt.js";
import { takePieces } from "#lib/utils/takePieces.js";
import { trimmedClip } from "#lib/utils/trimmedClip.js";
import { pairNoteEvents, type NoteEvent } from "#lib/utils/pairNoteEvents.js";
import { sliceNotes } from "#lib/utils/sliceNotes.js";
import { sliceLanes } from "#lib/utils/sliceLanes.js";
import { lanesFromEvents, type LaneEvent } from "#lib/utils/lanesFromEvents.js";
import { clipLaneEvents } from "#lib/utils/clipLaneEvents.js";
import {
	lanesFromMidiSummary,
	notesFromMidiSummary,
	notesToMidiBlob,
} from "#lib/utils/midiNotesFile.js";
import type { MidiSummary } from "./midi";
import {
	MAX_STUDIO_CLIPS,
	MAX_STUDIO_MARKERS,
	MAX_STUDIO_NOTES_PER_CLIP,
	MAX_STUDIO_TRACKS,
	STUDIO_FADER_MAX,
	STUDIO_MEMORY_WARNING_BYTES,
	STUDIO_SAMPLE_RATES,
	WARP_RATIO_MAX,
	WARP_RATIO_MIN,
} from "#lib/constants/studio.js";
import {
	scaleWarp,
	uniformWarp,
	warpContentAt,
	warpKey,
	warpSourceAt,
	warpUniformRatio,
	warpWithPoint,
	warpWithPointMoved,
	warpWithoutPoint,
} from "./warp.js";
import { renderWarpAsync } from "./warpRenderer.js";
import { pcmCache } from "./pcmCache";
import { clipCrossfades, type EffectiveFades } from "#lib/utils/clipCrossfades.js";
import { compRegion } from "#lib/utils/compRegion.js";
import { fadeCurve } from "#lib/utils/fadeCurve.js";
import { gainEnvelopeRamps } from "#lib/utils/gainEnvelope.js";
import { mixClipsToChannels } from "#lib/utils/mixClipsToChannels.js";
import { reverseChannels } from "#lib/utils/reverseChannels.js";
import { rippleDelete } from "#lib/utils/rippleDelete.js";
import { rangeDelete } from "#lib/utils/rangeDelete.js";
import { rangeInsert } from "#lib/utils/rangeInsert.js";
import { shiftTimes } from "#lib/utils/shiftTimes.js";
import type {
	TempoCurve,
	StudioArrangement,
	StudioClip,
	StudioInput,
	StudioInputSource,
	StudioNote,
	StudioSourceView,
	StudioTrack,
	StudioTrackFx,
	StudioTrackKind,
	StudioWarp,
	StudioAutomationPoint,
	StudioAutomation,
	StudioBus,
	StudioInsert,
	StudioSend,
	StudioFadeShape,
	StudioMarker,
	StudioMeterChange,
	StudioKeyChange,
	StudioTempoChange,
	StudioSampler,
	StudioClipLane,
} from "#lib/val/StudioSchema.js";
import { MIN_CLIP_LOOP_SECONDS } from "#lib/val/StudioSchema.js";
import { nanoid } from "nanoid";
import { amp, loadAmpWorklet } from "./amp.svelte";
import { drumMachine } from "./drumMachine.svelte";
import { inputSources, outputLatencyMs } from "./inputs.svelte";
import { INSTRUMENTS, samplerFor } from "./instruments";
import {
	isInstrument,
	STUDIO_INSTRUMENTS,
	type StudioInstrument,
} from "#lib/constants/studioInstruments.js";
import { startLookahead } from "./lookahead";
import { UndoStack } from "./undoStack";
import { metronome } from "./metronome.svelte";
import { claimPlayback, releasePlayback } from "./onlyOnePlays";
import { computePeaks } from "./peaks";
import { playThroughSilentSwitch } from "./playThroughSilentSwitch";
import { createStripGraph, type StripGraph } from "./stripGraph";
import { StudioGraph } from "./studioGraph";
import { insertsOf } from "#lib/utils/insertsFromFx.js";
import { monoForInput } from "#lib/utils/monoForInput.js";
import { automationLanes, laneTransfer } from "#lib/utils/automationLanes.js";
import { nanoid as newLocalId } from "nanoid";
import { MAX_STUDIO_BUSES, insertLaneKey, sendLaneKey } from "#lib/constants/studioInserts.js";
import { delaySyncSeconds, withSyncedDelays } from "#lib/utils/withSyncedDelays.js";

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
	/** "cold": on the server, not decoded here (nothing plays it yet; D8). */
	status: "cold" | "decoding" | "ready" | "failed";
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
/** A clip's fades as stored, in its own shape (no neighbor in play). */
const fadesOf = (c: StudioClip): EffectiveFades => ({
	fadeIn: c.fadeIn,
	fadeOut: c.fadeOut,
	inShape: c.fadeShape ?? "linear",
	outShape: c.fadeShape ?? "linear",
});
/**
 * A clip's gain over its playing span: silent at `at`, the in curve to
 * `peak`, a hold, the out curve back to silence at `at + length`
 * (utils/fadeCurve.ts for the shapes). The curves never overlap: each is
 * at most half the span less a hair, which `setValueCurveAtTime` insists
 * on.
 */
function scheduleFades(
	param: AudioParam,
	peak: number,
	at: number,
	length: number,
	f: EffectiveFades,
) {
	const half = Math.max(0.0005, length / 2 - 0.0005);
	const inLen = Math.min(f.fadeIn, half);
	const outLen = Math.min(f.fadeOut, half);
	param.value = 0;
	param.setValueCurveAtTime(fadeCurve(f.inShape, "in", peak), at, inLen);
	param.setValueCurveAtTime(fadeCurve(f.outShape, "out", peak), at + length - outLen, outLen);
}
/**
 * A clip's gain envelope over one pass of it (utils/gainEnvelope.ts): the
 * content span [offset, offset + length) plays from `at`, so each ramp
 * lands at `at + (t - offset)` on a gain of its own in series with the
 * fades (an AudioParam takes curves or ramps, not both over one stretch).
 * Returns the node to put in the chain, or null when the envelope is flat.
 */
function envelopeNode(
	ctx: BaseAudioContext,
	points: StudioClip["gainEnvelope"],
	at: number,
	offset: number,
	length: number,
): GainNode | null {
	const ramps = gainEnvelopeRamps(points, offset, offset + length);
	if (!ramps.length) return null;
	const node = ctx.createGain();
	const param = node.gain;
	param.setValueAtTime(ramps[0]!.v, at);
	for (const r of ramps.slice(1)) param.linearRampToValueAtTime(r.v, at + (r.t - offset));
	return node;
}
const LOAD_CONCURRENCY = 3;
/** What the strip maps read before the context opens. */
const NO_STRIPS: Map<string, StripGraph> = new Map();
/** Frames per peak of a take's live waveform (about a hundredth of a second). */
export const LIVE_PEAK_FRAMES = 512;
const UNDO_DEPTH = 100;
/**
 * How far ahead of the clock a clip's source is built and started. A pass
 * starts the clips that begin within it and queues the rest for the
 * look-ahead (lookahead.ts: a 25 ms timer reaching 0.1 s ahead), so a
 * song of hundreds of clips builds a few nodes at a time, not all at
 * play. Seconds rather than the look-ahead's tenth: a starved or
 * throttled timer then still finds every source started well before it
 * is due.
 */
export const STUDIO_SCHEDULE_HORIZON_S = 4;

export {
	isInstrument,
	STUDIO_INPUT_LABELS,
	STUDIO_INSTRUMENTS,
} from "#lib/constants/studioInstruments.js";

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
/** A segment of an audio clip in a pass, waiting for its source: started by the look-ahead once `at` is within the horizon. */
interface QueuedSegment {
	at: number;
	clip: StudioClip;
	buffer: AudioBuffer;
	seg: ClipSegment;
	/** The pass it belongs to. */
	from: number;
	when: number;
	to: number | null;
	/** The clip's fades, worked out once for the pass. */
	fades: EffectiveFades;
}
/** A MIDI track recording (phase 3): the instrument's note events as they come, until Stop pairs them into a clip. */
/** What the lane code needs of a strip's owner: a track, a bus, or the master as `#masterOwner` presents it. */
interface LaneOwner {
	gain: number;
	pan: number;
	automation?: StudioAutomation;
	sends?: StudioSend[];
	inserts?: StudioInsert[];
	fx?: StudioTrackFx;
}

interface MidiCapture {
	trackId: string;
	source: StudioInstrument;
	events: NoteEvent[];
	/** The pedal, the wheels and the bend as they moved, for the take's expression lanes. */
	controls: LaneEvent[];
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

/** What a bounce renders (`render`): the mix when neither is given, else one track or one bus alone. */
export interface RenderTarget {
	track?: string | null;
	bus?: string | null;
	/** A track for freezing (D8): its inserts and their lanes baked in, its fader, pan and their lanes left live. */
	freeze?: boolean;
}
/** Seconds past the last clip a bounce keeps, for reverbs and delays ringing out. */
const RENDER_TAIL_S = 1;

/** A beat unit as the schema has it: one of BEAT_UNITS, else a quarter. */
const beatUnitOf = (unit: number): BeatUnit =>
	(BEAT_UNITS as readonly number[]).includes(unit) ? (unit as BeatUnit) : 4;
/** A color as the arrangement keeps it: a palette tint's id or a `#rrggbb` in lower case; undefined for none or nonsense. */
const colourValue = (tint: string | null): string | undefined => {
	if (!tint) return undefined;
	if (/^#[0-9a-f]{6}$/i.test(tint)) return tint.toLowerCase();
	return stemTintHex(tint) ? tint : undefined;
};

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
	/** The master's loudness while playing (docs/dawn-daw-plan.md, D3): momentary (400 ms) and short-term (3 s) LUFS from a K-weighted tap on the master, null when stopped or silent. */
	masterLoudness = $state.raw<{ momentary: number | null; shortTerm: number | null }>({
		momentary: null,
		shortTerm: null,
	});
	/** One analyser per channel after the K-weighting (the standard sums the channels' mean squares). */
	#loudnessTaps: AnalyserNode[] = [];
	#loudnessBuf: Float32Array<ArrayBuffer> | null = null;
	/** The mean squares read from the taps, with the time of each, for the last three seconds. */
	#loudnessBlocks: { t: number; ms: number }[] = [];
	/** The context and the capture are open (a gesture did it). */
	ready = $state(false);
	notice = $state<string | null>(null);
	/** Decoded audio held, in bytes, for the readout. */
	memoryBytes = $state(0);
	/** How many sources are still decoding. */
	decoding = $state(0);
	/** How many warped renderings are under way (docs/multitrack-recorder.md "Warping a clip"). */
	warping = $state(0);
	/** The recording pass under way began here on the timeline. */
	recordFrom = $state(0);
	/** Takes recorded in this song so far (the next take's number is one more). */
	takeCount = $state(0);
	canUndo = $state(false);
	canRedo = $state(false);
	/** The arrangement changed since the page last saved it (the page clears it). */
	dirty = $state(false);
	/** Groups folded to their header in the timeline, by bus id (docs/multitrack-recorder.md "Folder tracks"); a view state, not saved. */
	collapsed = $state<Record<string, boolean>>({});
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
	/** The live signal graph (studioGraph.ts, D8): the master, a strip per bus and track; null until the context opens. */
	#graph: StudioGraph | null = null;
	get #masterStrip(): StripGraph | null {
		return this.#graph?.master ?? null;
	}
	get #buses(): Map<string, StripGraph> {
		return this.#graph?.buses ?? NO_STRIPS;
	}
	#buffers = new Map<string, AudioBuffer>();
	/**
	 * The disk copy of each decoded source in this browser (audio/pcmCache.ts,
	 * docs/multitrack-recorder.md "Scale and structure"): read before a
	 * fetch, written after one and for every source made here, forgotten
	 * with the source. The page can ask it what it holds (`estimate`).
	 */
	readonly pcmCache = pcmCache;
	/** The warped clips' content, rendered from their sources (audio/warp.ts), by source and warp. */
	#warped = new Map<string, AudioBuffer>();
	#warpJobs = new Map<string, Promise<void>>();
	/** Where each source's file is, for a cold one fetched on demand (D8). */
	#urls = new Map<string, string>();
	/** Sources held as blobs in this browser (the browser-kept song, studioLocal.ts): decoded from here, never fetched. */
	#blobs = new Map<string, Blob>();
	/** Which load the decode workers belong to: a song loaded over one still decoding must not count that one's finishes against its own tally. */
	#loadGeneration = 0;
	#loading = new Map<string, Promise<AudioBuffer | null>>();
	get #tracks(): Map<string, StripGraph> {
		return this.#graph?.tracks ?? NO_STRIPS;
	}
	#playing: Playing[] = [];
	/** The clip segments of the passes under way not yet started, by `at` (STUDIO_SCHEDULE_HORIZON_S). */
	#clipQueue: QueuedSegment[] = [];
	/** Each pass under way: the timeline second it began at and the context time it began on. */
	#passes: { from: number; when: number; to: number | null }[] = [];
	#stopLookahead: (() => void) | null = null;
	#frame = 0;
	#meterBuf: Float32Array<ArrayBuffer> | null = null;
	#captures: Capture[] = [];
	/** The undo history as patches, the state before each edit (audio/undoStack.ts; docs/multitrack-recorder.md "Scale and structure"). */
	#history = new UndoStack<StudioArrangement>(UNDO_DEPTH);
	/**
	 * The mix's moves (fader, pan, mute, solo, master, effects) join the undo
	 * stack one step per gesture (utils/mixHistory.ts decides where a gesture
	 * starts); the stack itself is `#history`, so ⌘Z steps through edits and
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
	/** The tempo map as a grid (utils/studioGrid.ts, D5): the song's tempo and meter, then each change at its second. */
	get grid(): BarGrid {
		return studioGrid(this.arrangement);
	}
	/** The length of the bar the playhead is in, and of a beat there. */
	get barSeconds() {
		return barSecondsAt(this.grid, this.position);
	}
	get beatSeconds() {
		return 60 / beatTempoAt(this.grid, this.position);
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
		for (const s of STUDIO_INSTRUMENTS)
			INSTRUMENTS[s].host(ctx, { bufferOf: (id) => this.#buffers.get(id) ?? null });
		metronome.hostContext(ctx);
		await ctx.audioWorklet.addModule("/worklets/track-capture.js");
		// The Practice Amp too (docs/practice-amp.md, "The band"): a track takes its output as heard, pedals and all.
		amp.hostContext(ctx, { gateWorklet: await loadAmpWorklet(ctx) });
		if (ctx.state !== "running") await ctx.resume().catch(() => {});
		this.#graph = new StudioGraph(
			ctx,
			{
				gainOf: (t) => this.#effectiveGain(t),
				busGainOf: (b) => this.#busGain(b),
				settle: (owner, strip, now) => this.#settleAutomation(owner, strip, now),
			},
			this.arrangement,
		);
		const master = this.#graph.master;
		this.#meterBuf = new Float32Array(1024);
		// A K-weighted tap on the master for the LUFS readout (utils/measureLoudness.ts has the design), a channel apiece.
		const [shelf, highPass] = kWeighting(ctx.sampleRate);
		const k1 = ctx.createIIRFilter([shelf.b0, shelf.b1, shelf.b2], [1, shelf.a1, shelf.a2]);
		const k2 = ctx.createIIRFilter(
			[highPass.b0, highPass.b1, highPass.b2],
			[1, highPass.a1, highPass.a2],
		);
		const split = ctx.createChannelSplitter(2);
		master.out.connect(k1).connect(k2).connect(split);
		this.#loudnessTaps = [0, 1].map((ch) => {
			const tap = ctx.createAnalyser();
			tap.fftSize = 2048;
			split.connect(tap, ch);
			return tap;
		});
		this.#loudnessBuf = new Float32Array(2048);
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
	/** The graph in step with the arrangement (studioGraph.ts): every bus and track a strip, routed; the gone dropped. */
	#ensureAllStrips() {
		this.#graph?.ensureAll(this.arrangement);
	}
	#bus(id: string) {
		return this.arrangement.buses?.find((b) => b.id === id) ?? null;
	}
	#ensureBus(busId: string): StripGraph | null {
		return this.#graph?.ensureBus(this.arrangement, busId) ?? null;
	}
	#dropBus(busId: string) {
		this.#graph?.dropBus(busId);
	}
	#ensureTrackNodes(trackId: string): StripGraph | null {
		return this.#graph?.ensureTrack(this.arrangement, trackId) ?? null;
	}
	#routeAll() {
		this.#graph?.routeAll(this.arrangement);
	}
	#dropTrackNodes(trackId: string) {
		this.#graph?.dropTrack(trackId);
	}

	// ── Loading ────────────────────────────────────────────────────────────
	/** A song from the page: its arrangement and its sources, fetched and decoded three at a time. */
	async load(song: {
		current: StudioArrangement | null;
		sources: (StudioSourceView & { blob?: Blob })[];
	}) {
		this.stop();
		this.#history.clear();
		this.#mixGestures.clear();
		this.canUndo = this.canRedo = false;
		this.#buffers.clear();
		this.#urls.clear();
		this.#blobs.clear();
		this.#loading.clear();
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
		// Only what the arrangement plays is decoded now (D8); the rest stays cold on the server until a clip, a take or the sampler asks for it.
		const needed = this.#referencedSourceIds();
		const next: Record<string, StudioSource> = {};
		for (const s of song.sources) {
			this.#urls.set(s.id, s.url);
			if (s.blob) this.#blobs.set(s.id, s.blob);
			next[s.id] = {
				id: s.id,
				label: s.trackLabel,
				durationSeconds: s.durationSeconds,
				sampleRate: s.sampleRate,
				channels: s.channels,
				peaks: Float32Array.from(s.peaks),
				status: needed.has(s.id) ? "decoding" : "cold",
				pending: false,
			};
		}
		this.sources = next;
		this.#ensureAllStrips();
		this.#applyGains(true);
		this.position = 0;
		this.#recount();
		// Decode in order, a few at a time.
		const queue = song.sources.filter((s) => needed.has(s.id));
		this.decoding = queue.length;
		const generation = ++this.#loadGeneration;
		const worker = async () => {
			for (;;) {
				const s = queue.shift();
				if (!s) return;
				try {
					const { buffer, fetched } = await this.#sourceBuffer(s.id, s.url);
					this.#holdLoaded(s.id, buffer, fetched);
				} catch {
					if (this.sources[s.id]) this.sources[s.id].status = "failed";
				} finally {
					if (generation === this.#loadGeneration) this.decoding--;
					this.#recount();
				}
			}
		};
		await Promise.all(Array.from({ length: LOAD_CONCURRENCY }, worker));
	}
	/**
	 * A loaded source held and marked ready, a fetched one copied to disk
	 * (audio/pcmCache.ts); false when the source is no longer the song's
	 * (another song loaded meanwhile).
	 */
	#holdLoaded(sourceId: string, buffer: AudioBuffer, fetched: boolean): boolean {
		const entry = this.sources[sourceId];
		if (!entry) return false;
		this.#buffers.set(sourceId, buffer);
		if (fetched) void pcmCache.write(sourceId, buffer);
		entry.status = "ready";
		entry.durationSeconds = buffer.duration;
		if (entry.peaks.length === 0) entry.peaks = computePeaks(buffer, 1024);
		this.#fillUnknownClips(sourceId, buffer);
		return true;
	}
	/**
	 * A source's samples: the disk copy when this browser keeps one
	 * (audio/pcmCache.ts), at the rate it was decoded at, else the file
	 * fetched and decoded (`fetched`, to be copied to disk). A source held
	 * as a blob here (the browser-kept song) is decoded from the blob and
	 * never copied: it is on this disk already.
	 */
	async #sourceBuffer(
		sourceId: string,
		url: string,
	): Promise<{ buffer: AudioBuffer; fetched: boolean }> {
		if (this.#blobs.has(sourceId))
			return { buffer: await this.#decode(await this.#bytesOf(sourceId, url)), fetched: false };
		const copy = await pcmCache.read(sourceId);
		if (copy?.channels.length) {
			try {
				const buffer = new AudioBuffer({
					numberOfChannels: copy.channels.length,
					length: Math.max(1, copy.channels[0]!.length),
					sampleRate: copy.sampleRate,
				});
				copy.channels.forEach((ch, i) => buffer.copyToChannel(ch as Float32Array<ArrayBuffer>, i));
				return { buffer, fetched: false };
			} catch {
				// A copy this browser will not hold (a rate out of its range): the network has the file.
			}
		}
		return { buffer: await this.#decode(await this.#bytesOf(sourceId, url)), fetched: true };
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
		for (const b of this.#warped.values()) bytes += b.length * b.numberOfChannels * 4;
		this.memoryBytes = bytes;
		// Past the warning line, what nothing plays goes cold on its own (D8).
		if (bytes > STUDIO_MEMORY_WARNING_BYTES && !this.#releasing) {
			this.#releasing = true;
			try {
				this.releaseUnused();
			} finally {
				this.#releasing = false;
			}
		}
	}
	#releasing = false;
	/** The sources the arrangement plays: every clip's, their takes aside, and the samplers'. */
	#referencedSourceIds(): Set<string> {
		const ids = new Set<string>();
		for (const c of this.arrangement.clips) if (c.sourceId) ids.add(c.sourceId);
		for (const t of this.arrangement.tracks) if (t.sampler) ids.add(t.sampler.sourceId);
		return ids;
	}
	/**
	 * A source decoded and held, fetched from the server when it is cold
	 * (D8): the buffer, or null when it cannot be had (never uploaded,
	 * failed). One fetch at a time per source.
	 */
	async ensureSource(sourceId: string): Promise<AudioBuffer | null> {
		const have = this.#buffers.get(sourceId);
		if (have) return have;
		const inFlight = this.#loading.get(sourceId);
		if (inFlight) return inFlight;
		const url = this.#urls.get(sourceId);
		const entry = this.sources[sourceId];
		if ((!url && !this.#blobs.has(sourceId)) || !entry) return null;
		entry.status = "decoding";
		this.decoding++;
		const job = (async () => {
			try {
				const { buffer, fetched } = await this.#sourceBuffer(sourceId, url ?? "");
				return this.#holdLoaded(sourceId, buffer, fetched) ? buffer : null;
			} catch {
				if (this.sources[sourceId]) this.sources[sourceId].status = "failed";
				return null;
			} finally {
				this.decoding--;
				this.#loading.delete(sourceId);
				this.#recount();
			}
		})();
		this.#loading.set(sourceId, job);
		return job;
	}
	/** Every source the arrangement plays, decoded (play, record and a bounce wait for this). */
	async ensureReferenced(): Promise<void> {
		await Promise.all([...this.#referencedSourceIds()].map((id) => this.ensureSource(id)));
	}
	/** The buffers nothing plays dropped from memory; the sources stay listed, cold, fetched again when wanted. Returns how many went. */
	releaseUnused(): number {
		const needed = this.#referencedSourceIds();
		let n = 0;
		for (const id of Array.from(this.#buffers.keys())) {
			const entry = this.sources[id];
			if (needed.has(id) || !entry || entry.pending || !this.#urls.has(id)) continue;
			this.#buffers.delete(id);
			entry.status = "cold";
			n++;
		}
		if (n) {
			let bytes = 0;
			for (const b of this.#buffers.values()) bytes += b.length * b.numberOfChannels * 4;
			this.memoryBytes = bytes;
		}
		return n;
	}
	/** For the export (audio/studioExport.ts): a source at the song's rate when the device decoded it at another. */
	resample(buffer: AudioBuffer, sampleRate: number): Promise<AudioBuffer> {
		return resampleBuffer(buffer, sampleRate);
	}
	bufferOf(sourceId: string): AudioBuffer | null {
		return this.#buffers.get(sourceId) ?? null;
	}
	/**
	 * The audio a clip plays (docs/multitrack-recorder.md "Warping a clip"):
	 * its source, or, for a warped clip, the rendering of its warp, made in
	 * a worker the first time it is asked for and null until it is in (the
	 * pass restarts and the timeline redraws then).
	 */
	clipBufferOf(clip: StudioClip): AudioBuffer | null {
		if (!clip.sourceId) return null;
		const source = this.#buffers.get(clip.sourceId) ?? null;
		if (!clip.warp || !source) return source;
		const key = `${clip.sourceId}|${warpKey(clip.warp)}`;
		const have = this.#warped.get(key);
		if (have) return have;
		void this.#renderWarped(key, source, $state.snapshot(clip.warp) as StudioWarp);
		return null;
	}
	#renderWarped(key: string, source: AudioBuffer, warp: StudioWarp): Promise<void> {
		const running = this.#warpJobs.get(key);
		if (running) return running;
		this.warping++;
		const channels = Array.from({ length: source.numberOfChannels }, (_, c) =>
			source.getChannelData(c),
		);
		const job = renderWarpAsync(channels, source.sampleRate, warp)
			.then((out) => {
				const buffer = new AudioBuffer({
					numberOfChannels: out.length || 1,
					length: Math.max(1, out[0]?.length ?? 1),
					sampleRate: source.sampleRate,
				});
				out.forEach((ch, i) => buffer.copyToChannel(ch as Float32Array<ArrayBuffer>, i));
				this.#warped.set(key, buffer);
				this.#pruneWarped();
				this.#recount();
				if (this.running) this.#reschedule();
			})
			.catch(() => {})
			.finally(() => {
				this.#warpJobs.delete(key);
				this.warping--;
			});
		this.#warpJobs.set(key, job);
		return job;
	}
	/** Renderings no clip asks for any more are let go. */
	#pruneWarped() {
		const live = new Set(
			this.arrangement.clips
				.filter((c) => c.sourceId && c.warp)
				.map((c) => `${c.sourceId}|${warpKey(c.warp!)}`),
		);
		for (const key of Array.from(this.#warped.keys())) if (!live.has(key)) this.#warped.delete(key);
	}
	/** Every warped clip's rendering in: a render or an export waits for them. */
	async ensureWarped(): Promise<void> {
		for (const c of this.arrangement.clips) if (c.warp && c.sourceId) this.clipBufferOf(c);
		await Promise.all(Array.from(this.#warpJobs.values()));
	}
	/** The queue finished uploading a take: the source is on the server under the same id. */
	markSourceSaved(sourceId: string) {
		const s = this.sources[sourceId];
		if (s) s.pending = false;
	}
	/** A source's bytes: the blob held here, else the file fetched from the server. */
	async #bytesOf(sourceId: string, url: string): Promise<ArrayBuffer> {
		const blob = this.#blobs.get(sourceId);
		if (blob) return blob.arrayBuffer();
		const res = await fetch(url);
		if (res.ok) return res.arrayBuffer();
		// The file may have moved: the jobs function turns a WAV source into FLAC under a new
		// pathname and drops the WAV (docs/multitrack-recorder.md "Scale and structure"). Ask the
		// page for the song's URLs as they are now and try once more where the URL changed.
		if (this.refreshUrls) {
			await this.refreshUrls().catch(() => undefined);
			const fresh = this.#urls.get(sourceId);
			if (fresh && fresh !== url) {
				const again = await fetch(fresh);
				if (again.ok) return again.arrayBuffer();
				throw new Error(`${again.status}`);
			}
		}
		throw new Error(`${res.status}`);
	}
	/** Set by the page: reload the song's source URLs from the server (`noteSourceUrls`), for a fetch that found a file gone. */
	refreshUrls: (() => Promise<void>) | null = null;
	/** Where the song's sources are on the server (the page, after a refresh): a source made here can then go cold and come back (D8). */
	noteSourceUrls(sources: { id: string; url: string }[]) {
		for (const src of sources) if (this.sources[src.id]) this.#urls.set(src.id, src.url);
	}
	/** A source no clip uses any more, dropped from memory (and, by the page, from the server). */
	forgetSource(sourceId: string) {
		this.#buffers.delete(sourceId);
		void pcmCache.forget(sourceId);
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

	/**
	 * A clip laid down before its source's length was known (a stem imported
	 * with no recorded length: one millisecond, the schema's floor) runs to
	 * the source's end once the source decodes. Saved with the song, not an
	 * undo step: nothing the band did.
	 */
	#fillUnknownClips(sourceId: string, buffer: AudioBuffer) {
		let changed = false;
		for (const c of this.arrangement.clips) {
			if (c.sourceId !== sourceId || c.duration > 0.001) continue;
			const length = (c.warp ? warpContentAt(c.warp, buffer.duration) : buffer.duration) - c.offset;
			if (length <= 0.001) continue;
			c.duration = length;
			changed = true;
		}
		if (!changed) return;
		this.dirty = true;
		if (this.running) this.#reschedule();
	}

	// ── Edits (each snapshots for undo and marks the song dirty) ───────────
	#commit() {
		this.#history.push($state.snapshot(this.arrangement) as StudioArrangement);
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
		const prev = this.#history.undo($state.snapshot(this.arrangement) as StudioArrangement);
		if (prev) this.#restoreArrangement(prev);
	}
	redo() {
		this.#mixGestures.clear();
		const next = this.#history.redo($state.snapshot(this.arrangement) as StudioArrangement);
		if (next) this.#restoreArrangement(next);
	}
	#restoreArrangement(a: StudioArrangement) {
		const wasRunning = this.running;
		if (wasRunning) this.stop();
		this.arrangement = a;
		this.canUndo = this.#history.canUndo;
		this.canRedo = this.#history.canRedo;
		this.dirty = true;
		this.#ensureAllStrips();
		this.#masterStrip?.setInserts(this.#synced(a.masterInserts ?? []), 0);
		this.#applyGains(true);
		this.#settleAllAutomation();
		for (const t of a.tracks) this.#tracks.get(t.id)?.setInserts(this.#synced(insertsOf(t)), 0);
		for (const b of a.buses ?? []) this.#buses.get(b.id)?.setInserts(this.#synced(insertsOf(b)), 0);
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
	/** A track's color: a tint id (constants/stemTints.ts) or any `#rrggbb` (docs/multitrack-recorder.md "Track colors"), kept on the arrangement as `colour`; null for none. */
	setTint(trackId: string, tint: string | null) {
		const t = this.#track(trackId);
		if (!t) return;
		t.colour = colourValue(tint);
		this.dirty = true;
	}
	/** A mono track (docs/multitrack-recorder.md "Mono tracks"): its strip sums to one channel and pans as a point source. */
	setMono(trackId: string, mono: boolean) {
		const t = this.#track(trackId);
		if (!t || !!t.mono === mono) return;
		this.#commitMixGesture();
		if (mono) t.mono = true;
		else delete t.mono;
		this.dirty = true;
		this.#tracks.get(trackId)?.setMono(mono);
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
		this.#tracks.get(trackId)?.setInserts(this.#synced(insertsOf(t)), 0.02);
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
			this.#masterStrip?.setInserts(this.#synced(list), 0.02);
			return;
		}
		const owner = this.#track(ownerId) ?? this.#bus(ownerId);
		if (!owner) return;
		this.#commitMixGesture();
		owner.inserts = list;
		this.dirty = true;
		(this.#tracks.get(ownerId) ?? this.#buses.get(ownerId))?.setInserts(this.#synced(list), 0.02);
		this.#afterLaneChange(ownerId);
	}
	/** Inserts as the strips hear them now: a synced delay's time from the tempo at the playhead (utils/withSyncedDelays.ts). */
	#synced(inserts: StudioInsert[], at = this.position): StudioInsert[] {
		return withSyncedDelays(inserts, tempoAt(this.grid, at));
	}
	/** A send's tap: before the fader (`pre`) or after the inserts (post), the level kept. */
	setSendPre(trackId: string, busId: string, pre: boolean) {
		const t = this.#track(trackId);
		const send = t?.sends?.find((s) => s.bus === busId);
		if (!t || !send || !!send.pre === pre) return;
		this.#commitMixGesture();
		if (pre) send.pre = true;
		else delete send.pre;
		this.dirty = true;
		this.#routeAll();
	}
	/** A new bus, to the master; its id for the caller. A `folder` bus is a group (docs/multitrack-recorder.md "Folder tracks"). */
	addBus(name = `Bus ${(this.arrangement.buses?.length ?? 0) + 1}`, folder = false): string | null {
		if ((this.arrangement.buses?.length ?? 0) >= MAX_STUDIO_BUSES) return null;
		this.#commit();
		const bus: StudioBus = {
			id: newLocalId(),
			name,
			gain: 1,
			pan: 0,
			muted: false,
			...(folder ? { folder: true } : {}),
		};
		this.arrangement.buses = [...(this.arrangement.buses ?? []), bus];
		this.#ensureBus(bus.id);
		this.#routeAll();
		return bus.id;
	}
	/** A new group: a folder bus named for its number, with a row in the timeline. */
	addGroup(name?: string): string | null {
		const n = (this.arrangement.buses ?? []).filter((b) => b.folder).length + 1;
		return this.addBus(name ?? `Group ${n}`, true);
	}
	/** The bus goes; what was routed to it goes where it went (its output bus, or the master), sends to it are dropped. */
	removeBus(busId: string) {
		const gone = this.#bus(busId);
		if (!gone) return;
		this.#commit();
		const to = gone.output && this.#bus(gone.output) ? gone.output : undefined;
		this.arrangement.buses = (this.arrangement.buses ?? []).filter((b) => b.id !== busId);
		for (const b of this.arrangement.buses) if (b.output === busId) b.output = to;
		for (const t of this.arrangement.tracks) {
			if (t.output === busId) t.output = to;
			if (t.sends?.some((s) => s.bus === busId)) t.sends = t.sends.filter((s) => s.bus !== busId);
		}
		this.#dropBus(busId);
		this.#routeAll();
	}
	/** A bus shown as a group in the timeline, or back to a plain bus (what routes to it stays routed). */
	setBusFolder(busId: string, folder: boolean) {
		const b = this.#bus(busId);
		if (!b || !!b.folder === folder) return;
		this.#commit();
		if (folder) b.folder = true;
		else delete b.folder;
	}
	/** Where a bus goes: another bus (never one that feeds it, which would loop), or the master with null. */
	setBusOutput(busId: string, to: string | null) {
		const b = this.#bus(busId);
		if (!b || (b.output ?? null) === to) return;
		if (to && (!this.#bus(to) || busDescendants(this.arrangement.buses ?? [], busId).has(to)))
			return;
		this.#commit();
		if (to) b.output = to;
		else delete b.output;
		this.#routeAll();
	}
	/**
	 * A track into a group (its output goes to the group's bus, and it moves
	 * to sit after the group's last track so the group reads as one block),
	 * or out of every group with null (to the master).
	 */
	groupTrack(trackId: string, groupId: string | null) {
		const t = this.#track(trackId);
		if (!t || (groupId && !this.#bus(groupId)?.folder)) return;
		if ((t.output ?? null) === groupId) return;
		this.#commit();
		t.output = groupId ?? undefined;
		if (groupId) {
			const tracks = this.arrangement.tracks;
			const members = tracks.filter((x) => x.output === groupId && x.id !== trackId);
			const last = members.length ? tracks.indexOf(members[members.length - 1]!) : -1;
			const from = tracks.indexOf(t);
			if (last >= 0 && from !== last + 1) {
				tracks.splice(from, 1);
				tracks.splice(from < last ? last : last + 1, 0, t);
			}
		}
		this.#routeAll();
	}
	/** A group's row folded to its header (not saved with the song). */
	toggleGroupCollapsed(busId: string) {
		if (this.collapsed[busId]) {
			const { [busId]: _gone, ...rest } = this.collapsed;
			this.collapsed = rest;
		} else this.collapsed = { ...this.collapsed, [busId]: true };
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
		b.colour = colourValue(tint);
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
		this.#followInputChannels(t);
	}
	setInput(trackId: string, input: StudioInput | null) {
		const t = this.#track(trackId);
		if (!t || this.recording) return;
		t.input = input;
		this.dirty = true;
		this.#followInputChannels(t);
	}
	/** An empty armed track takes its input's channel count as its mono setting (utils/monoForInput.ts). */
	#followInputChannels(t: StudioTrack) {
		const mono = monoForInput(
			t,
			this.arrangement.clips.some((c) => c.trackId === t.id),
		);
		if (mono === null) return;
		if (mono) t.mono = true;
		else delete t.mono;
		this.#tracks.get(t.id)?.setMono(mono);
	}
	setMaster(value: number) {
		if (this.writeAutomation("master", "volume", value)) return;
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
		const before = this.grid;
		this.arrangement.bpm = v;
		metronome.setBpm(v);
		this.#retimeAnchored(before);
	}
	/**
	 * Beats-anchored clips (docs/multitrack-recorder.md "Beats-anchored
	 * clips") carried from the tempo map as it was (`before`) to the map as
	 * it is now: a MIDI clip's every moment keeps its beat; an audio clip's
	 * start keeps its beat and its content is stretched to keep its length
	 * in beats (within the hand range). Called by every tempo edit, inside
	 * its undo step.
	 */
	#retimeAnchored(before: BarGrid) {
		const after = this.grid;
		let moved = false;
		for (const c of this.arrangement.clips) {
			if (c.anchor !== "beats") continue;
			const { clip, stretch } = retimeClip(c, before, after);
			if (clip.start !== c.start || clip.duration !== c.duration || c.notes) {
				c.start = clip.start;
				c.offset = clip.offset;
				c.duration = clip.duration;
				if (clip.notes) c.notes = clip.notes;
				if (clip.lanes) c.lanes = clip.lanes;
				if (clip.loop) c.loop = clip.loop;
				moved = true;
			}
			if (c.sourceId && Math.abs(stretch - 1) > 1e-6)
				moved = this.#scaleClipBy(c, stretch) || moved;
		}
		if (moved) this.#reschedule();
	}
	/** What a clip holds to when the tempo changes: its beats (a MIDI clip's default) or its seconds. */
	setClipAnchor(clipId: string, anchor: "beats" | "seconds") {
		const c = this.#clip(clipId);
		if (!c || (c.anchor ?? "seconds") === anchor) return;
		this.#commit();
		if (anchor === "seconds") delete c.anchor;
		else c.anchor = anchor;
		this.dirty = true;
	}
	/**
	 * The song's meter from zero: beats a bar, and the note a beat is (the
	 * time signature's bottom number, docs/multitrack-recorder.md
	 * "Time-signature denominators"); the unit alone left as it was.
	 */
	setBeatsPerBar(n: number, unit?: number) {
		if (!Number.isFinite(n)) return;
		const v = Math.max(2, Math.min(7, Math.round(n)));
		const u = unit === undefined ? (this.arrangement.beatUnit ?? 4) : beatUnitOf(unit);
		if (v === this.arrangement.beatsPerBar && u === (this.arrangement.beatUnit ?? 4)) return;
		this.#commit();
		this.arrangement.beatsPerBar = v;
		if (u === 4) delete this.arrangement.beatUnit;
		else this.arrangement.beatUnit = u;
		metronome.setBeats(v);
		metronome.setBeatUnit(u);
	}
	/**
	 * The song's sample rate (Song settings, docs/multitrack-recorder.md "Sample
	 * rates"): the mix, the stems and the project files render at it on every
	 * machine; recording and playback stay at the device's rate.
	 */
	setSampleRate(rate: number) {
		if (!(STUDIO_SAMPLE_RATES as readonly number[]).includes(rate)) return;
		if (rate === songSampleRate(this.arrangement)) return;
		this.#commit();
		this.arrangement.sampleRate = rate as StudioArrangement["sampleRate"];
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
		return this.arrangement.gridOn ? snapToBeat(this.grid, seconds) : Math.max(0, seconds);
	}

	/** The beat lines inside the tempo ramps between `from` and `to` (a ramp runs from the change before it up to its own second). */
	#rampBeats(grid: BarGrid, from: number, to: number): number[] {
		const out: number[] = [];
		const tempos = grid.tempos;
		for (let i = 1; i < tempos.length; i++) {
			const c = tempos[i]!;
			if (!c.ramp) continue;
			const lo = Math.max(from, tempos[i - 1]!.start);
			const hi = Math.min(to, c.start);
			let t = nextBeatAt(grid, lo).at;
			for (let guard = 0; guard < 10000 && t < hi; guard++) {
				if (t > lo) out.push(t);
				t = nextBeatAt(grid, t + 0.0005).at;
			}
		}
		return out;
	}

	// ── The tempo map (D5) ────────────────────────────────────────────────
	/**
	 * A tempo change at a second (one at that second replaced, its ramp kept
	 * unless `ramp` says otherwise); at zero it is the song's own tempo. With
	 * `ramp`, the tempo climbs or falls to this one from the tempo before it
	 * along that curve (docs/multitrack-recorder.md "Tempo ramps").
	 */
	setTempoChange(start: number, bpm: number, ramp?: TempoCurve | null) {
		const v = Math.max(30, Math.min(300, Math.round(bpm)));
		const at = round4(Math.max(0, start));
		if (at === 0) return this.setBpm(v);
		this.#commit();
		const before = this.grid;
		const list = this.arrangement.tempoChanges ?? [];
		const was = list.find((c) => Math.abs(c.start - at) <= 0.001);
		const rest = list.filter((c) => Math.abs(c.start - at) > 0.001);
		const curve = ramp === undefined ? was?.ramp : (ramp ?? undefined);
		this.arrangement.tempoChanges = [
			...rest,
			{ start: at, bpm: v, ...(curve ? { ramp: curve } : {}) },
		].sort((a, b) => a.start - b.start);
		this.#retimeAnchored(before);
		this.#reschedule();
	}
	/** The ramp of the tempo change at a second: on along `ramp`, or off (a step) with null. */
	setTempoRamp(start: number, ramp: TempoCurve | null) {
		const c = (this.arrangement.tempoChanges ?? []).find((x) => Math.abs(x.start - start) <= 0.001);
		if (!c || (c.ramp ?? null) === ramp) return;
		this.setTempoChange(c.start, c.bpm, ramp);
	}
	removeTempoChange(start: number) {
		const list = this.arrangement.tempoChanges ?? [];
		if (!list.some((c) => Math.abs(c.start - start) <= 0.001)) return;
		this.#commit();
		const before = this.grid;
		this.arrangement.tempoChanges = list.filter((c) => Math.abs(c.start - start) > 0.001);
		if (!this.arrangement.tempoChanges.length) delete this.arrangement.tempoChanges;
		this.#retimeAnchored(before);
		this.#reschedule();
	}
	setMeterChange(start: number, beatsPerBar: number, unit?: number) {
		const v = Math.max(2, Math.min(7, Math.round(beatsPerBar)));
		const u = beatUnitOf(unit ?? 4);
		const at = round4(Math.max(0, start));
		if (at === 0) return this.setBeatsPerBar(v, u);
		this.#commit();
		const rest = (this.arrangement.meterChanges ?? []).filter(
			(c) => Math.abs(c.start - at) > 0.001,
		);
		this.arrangement.meterChanges = [
			...rest,
			{ start: at, beatsPerBar: v, ...(u !== 4 ? { beatUnit: u } : {}) },
		].sort((a, b) => a.start - b.start);
		this.#reschedule();
	}
	removeMeterChange(start: number) {
		const list = this.arrangement.meterChanges ?? [];
		if (!list.some((c) => Math.abs(c.start - start) <= 0.001)) return;
		this.#commit();
		this.arrangement.meterChanges = list.filter((c) => Math.abs(c.start - start) > 0.001);
		if (!this.arrangement.meterChanges.length) delete this.arrangement.meterChanges;
		this.#reschedule();
	}
	get tempoChanges(): StudioTempoChange[] {
		return this.arrangement.tempoChanges ?? [];
	}
	get meterChanges(): StudioMeterChange[] {
		return this.arrangement.meterChanges ?? [];
	}
	// ── The key (Kevin, 2026-10-20): the song's own from zero, and changes on the ruler, as the stem player's ──
	/** The song's key as written ("F#m", "A♭ major"); empty clears it. An undo step. */
	setKey(key: string) {
		const v = key.trim().slice(0, 20);
		if ((this.arrangement.key ?? "") === v) return;
		this.#commit();
		if (v) this.arrangement.key = v;
		else delete this.arrangement.key;
	}
	/** A key change at a second (one at that second replaced); at zero it is the song's own key. */
	setKeyChange(start: number, key: string) {
		const v = key.trim().slice(0, 20);
		const at = round4(Math.max(0, start));
		if (!v) return this.removeKeyChange(at);
		if (at === 0) return this.setKey(v);
		this.#commit();
		const rest = (this.arrangement.keyChanges ?? []).filter((c) => Math.abs(c.start - at) > 0.001);
		this.arrangement.keyChanges = [...rest, { start: at, key: v }].sort(
			(a, b) => a.start - b.start,
		);
	}
	removeKeyChange(start: number) {
		const list = this.arrangement.keyChanges ?? [];
		if (!list.some((c) => Math.abs(c.start - start) <= 0.001)) return;
		this.#commit();
		this.arrangement.keyChanges = list.filter((c) => Math.abs(c.start - start) > 0.001);
		if (!this.arrangement.keyChanges.length) delete this.arrangement.keyChanges;
	}
	get keyChanges(): StudioKeyChange[] {
		return this.arrangement.keyChanges ?? [];
	}
	/** The key in force at a second (utils/studioChanges.ts); "" without one. */
	keyAt(seconds: number): string {
		return studioKeyAt(this.arrangement, seconds);
	}
	/** A MIDI track's feel (utils/swingNotes.ts): swing of the off-beat eighths and humanize, 0 to 1; 0 clears. */
	setTrackSwing(trackId: string, swing: number) {
		const t = this.#track(trackId);
		if (!t) return;
		const v = Math.round(Math.max(0, Math.min(1, swing)) * 100) / 100;
		if ((t.swing ?? 0) === v) return;
		this.#commit();
		if (v === 0) delete t.swing;
		else t.swing = v;
		this.#reschedule();
	}
	setTrackHumanize(trackId: string, humanize: number) {
		const t = this.#track(trackId);
		if (!t) return;
		const v = Math.round(Math.max(0, Math.min(1, humanize)) * 100) / 100;
		if ((t.humanize ?? 0) === v) return;
		this.#commit();
		if (v === 0) delete t.humanize;
		else t.humanize = v;
		this.#reschedule();
	}
	// ── The sampler and the library (D6) ──────────────────────────────────
	/** A sampler track's sound: a recording of the song's and how it plays (instruments.ts); the first choice brings the defaults. */
	setSampler(trackId: string, patch: Partial<StudioSampler> & { sourceId?: string }) {
		const t = this.#track(trackId);
		if (!t) return;
		const sourceId = patch.sourceId ?? t.sampler?.sourceId;
		if (!sourceId) return;
		const next: StudioSampler = { ...(t.sampler ?? samplerFor(sourceId)), ...patch, sourceId };
		next.root = Math.max(0, Math.min(127, Math.round(next.root)));
		next.attack = Math.max(0, Math.min(5, next.attack));
		next.release = Math.max(0, Math.min(5, next.release));
		if (JSON.stringify(next) === JSON.stringify(t.sampler)) return;
		this.#commit();
		t.sampler = next;
		this.#reschedule();
		void this.ensureSource(sourceId);
	}
	/** A clip over the whole of a recording the song holds, on an audio track at a time (the library's drag). */
	addClipFromSource(trackId: string, sourceId: string, at: number): StudioClip | null {
		const t = this.#track(trackId);
		const src = this.sources[sourceId];
		if (!t || t.kind === "midi" || !src) return null;
		if (!this.#buffers.has(sourceId))
			void this.ensureSource(sourceId).then(() => this.#reschedule());
		return this.addClip({
			trackId,
			sourceId,
			start: round4(Math.max(0, at)),
			offset: 0,
			duration: round4(src.durationSeconds),
			gain: 1,
			fadeIn: 0,
			fadeOut: 0,
			name: src.label,
		});
	}
	#preview: AudioBufferSourceNode | null = null;
	/** A recording heard on its own, from the start (the library's play); the one before stops. Null stops. */
	async previewSource(sourceId: string | null): Promise<void> {
		this.#preview?.stop();
		this.#preview = null;
		if (!sourceId) return;
		await this.open();
		const ctx = this.#ctx;
		const buffer = await this.ensureSource(sourceId);
		if (!ctx || !buffer) return;
		const src = ctx.createBufferSource();
		src.buffer = buffer;
		src.connect(ctx.destination);
		src.onended = () => {
			if (this.#preview === src) this.#preview = null;
		};
		src.start();
		this.#preview = src;
	}
	get previewing() {
		return this.#preview !== null;
	}
	/** The tempo of a clip's audio, from its onsets (utils/detectTempo.ts); null when it cannot tell. */
	detectClipTempo(clipId: string): number | null {
		const c = this.#clip(clipId);
		const got = c && this.#clipChannels(c);
		return got ? detectTempo(got.channels, got.sampleRate) : null;
	}
	/**
	 * The clip's audio stretched to `ratio` times its length and shifted by
	 * `semitones`, as a new recording of its own (utils/stretchChannels.ts,
	 * a WSOLA; the pitch by resampling then stretching back). The clip
	 * follows the new length.
	 */
	stretchClip(clipId: string, o: { ratio?: number; semitones?: number }): boolean {
		const ratio = Math.max(0.25, Math.min(4, o.ratio ?? 1));
		const semitones = Math.max(-24, Math.min(24, Math.round(o.semitones ?? 0)));
		if (Math.abs(ratio - 1) < 1e-6 && semitones === 0) return false;
		const c = this.#clip(clipId);
		const got = c && this.#clipChannels(c);
		if (!c || !got) return false;
		const factor = semitonesFactor(semitones);
		const shifted = semitones ? resampleChannels(got.channels, factor) : got.channels;
		const out = stretchChannels(shifted, ratio * factor, got.sampleRate);
		const parts = [
			...(Math.abs(ratio - 1) >= 1e-6 ? [`×${ratio}`] : []),
			...(semitones ? [`${semitones > 0 ? "+" : ""}${semitones} st`] : []),
		];
		this.#replaceClipSource(c, out, got.sampleRate, parts.join(" "));
		return true;
	}

	addClip(clip: Omit<StudioClip, "id">): StudioClip | null {
		if (this.arrangement.clips.length >= MAX_STUDIO_CLIPS) {
			this.notice = `A song holds at most ${MAX_STUDIO_CLIPS} clips.`;
			return null;
		}
		this.#commit();
		// A new notes clip follows the tempo unless told otherwise (docs/multitrack-recorder.md "Beats-anchored clips").
		const anchor = clip.notes && clip.anchor === undefined ? { anchor: "beats" as const } : {};
		const c = { ...clip, ...anchor, id: localId() };
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
		const file = c.sourceId && this.sources[c.sourceId]?.durationSeconds;
		// A warped clip's content runs the file's length through its warp (audio/warp.ts).
		return file ? (c.warp ? warpContentAt(c.warp, file) : file) : c.offset + c.duration;
	}
	/** How long a clip's file runs, in its own seconds. */
	#fileSeconds(c: StudioClip) {
		const known =
			(c.sourceId &&
				(this.sources[c.sourceId]?.durationSeconds || this.#buffers.get(c.sourceId)?.duration)) ||
			0;
		if (known) return known;
		const end = c.offset + c.duration;
		return c.warp ? warpSourceAt(c.warp, end) : end;
	}
	/**
	 * Trim: a new left edge moves `start` and `offset` together (no earlier
	 * than the source's own start), a new right edge sets the duration (no
	 * later than the source's end; a looped clip has no end to reach). A
	 * clip keeps at least 10 ms.
	 */
	trimClip(clipId: string, edges: { start?: number; end?: number }) {
		const c = this.#clip(clipId);
		if (!c) return;
		const next = trimmedClip(c, edges, c.loop ? Number.POSITIVE_INFINITY : this.#sourceSeconds(c));
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
	/**
	 * The clip's gain envelope replaced whole (docs/multitrack-recorder.md "Clip
	 * gain envelopes"): points in content seconds with a factor each, kept in
	 * time order; none takes the envelope away (a point at one is kept: it is
	 * where the next drag starts). One undo step per call: the timeline
	 * previews a drag and calls once at its end.
	 */
	setClipGainEnvelope(clipId: string, points: StudioClip["gainEnvelope"]) {
		const c = this.#clip(clipId);
		if (!c?.sourceId) return;
		const next = (points ?? [])
			.map((p) => ({ t: round4(Math.max(0, p.t)), v: round4(Math.max(0, Math.min(2, p.v))) }))
			.sort((a, b) => a.t - b.t);
		const kept = next.length ? next : undefined;
		if (JSON.stringify(kept) === JSON.stringify(c.gainEnvelope)) return;
		this.#commit();
		if (kept) c.gainEnvelope = kept;
		else delete c.gainEnvelope;
		this.#reschedule();
	}
	/**
	 * Loop (docs/multitrack-recorder.md, "Looping a clip"): on, the clip's
	 * content as it stands becomes the loop and the clip can be dragged
	 * longer to repeat it; off, the clip plays once and shrinks to what its
	 * source holds. A span sets the loop in content seconds outright.
	 */
	setClipLoop(clipId: string, loop: boolean | { start: number; end: number }) {
		const c = this.#clip(clipId);
		if (!c) return;
		if (loop === false) {
			if (!c.loop) return;
			this.#commit();
			delete c.loop;
			const srcEnd = this.#sourceSeconds(c);
			if (c.offset >= srcEnd) c.offset = 0;
			c.duration = round4(Math.max(0.01, Math.min(c.duration, srcEnd - c.offset)));
			c.fadeIn = Math.min(c.fadeIn, c.duration / 2);
			c.fadeOut = Math.min(c.fadeOut, c.duration / 2);
		} else {
			const span =
				loop === true
					? { start: c.offset, end: c.offset + c.duration }
					: { start: Math.max(0, loop.start), end: loop.end };
			if (!(span.end - span.start >= MIN_CLIP_LOOP_SECONDS)) return;
			if (c.loop && c.loop.start === span.start && c.loop.end === span.end) return;
			this.#commit();
			c.loop = { start: round4(span.start), end: round4(span.end) };
		}
		this.#reschedule();
	}
	// ── Warping (docs/multitrack-recorder.md, "Warping a clip") ──────────────
	/**
	 * The clip's content re-timed through `warp` (audio/warp.ts), what it
	 * shows kept: its offset, duration and loop follow the file through the
	 * old map and the new. Null returns the file's own speed.
	 */
	setClipWarp(clipId: string, warp: StudioWarp | null) {
		const c = this.#clip(clipId);
		if (!c?.sourceId || (!warp && !c.warp)) return;
		if (warp && c.warp && warpKey(warp) === warpKey(c.warp)) return;
		this.#commit();
		const toSource = (t: number) => (c.warp ? warpSourceAt(c.warp, t) : t);
		const toContent = (s: number) => (warp ? warpContentAt(warp, s) : s);
		const map = (t: number) => round4(Math.max(0, toContent(toSource(t))));
		const end = map(c.offset + c.duration);
		c.offset = map(c.offset);
		c.duration = round4(Math.max(0.01, end - c.offset));
		if (c.loop) {
			const loop = { start: map(c.loop.start), end: map(c.loop.end) };
			if (loop.end - loop.start >= MIN_CLIP_LOOP_SECONDS) c.loop = loop;
			else delete c.loop;
		}
		c.fadeIn = Math.min(c.fadeIn, c.duration / 2);
		c.fadeOut = Math.min(c.fadeOut, c.duration / 2);
		if (warp) c.warp = warp;
		else delete c.warp;
		this.#reschedule();
	}
	/** The clip stretched by hand to `duration` seconds on the timeline (Alt-drag of its right edge): the whole file by one factor, pitch kept. */
	stretchClipTo(clipId: string, duration: number): boolean {
		const c = this.#clip(clipId);
		if (!c?.sourceId || !(duration > 0.01)) return false;
		return this.#scaleClip(c, duration / c.duration);
	}
	/** The clip told its recording's own tempo: stretched so that tempo lands on the song's where the clip sits, pitch kept. */
	fitClipTempo(clipId: string, clipBpm: number): boolean {
		const c = this.#clip(clipId);
		if (!c?.sourceId || !(clipBpm > 0)) return false;
		const want = clipBpm / tempoAt(this.grid, c.start);
		return this.#scaleClip(c, want / this.#ratioOf(c));
	}
	/** A clip's own tempo as its warp has it: the song's tempo where it sits times its stretch; null for a clip warped unevenly. */
	clipTempoOf(clip: StudioClip): number | null {
		const song = tempoAt(this.grid, clip.start);
		if (!clip.warp) return Math.round(song * 10) / 10;
		const ratio = warpUniformRatio(clip.warp);
		return ratio === null ? null : Math.round(song * ratio * 10) / 10;
	}
	/** How much longer a clip's content runs than its file: its one ratio, or the mean over an uneven warp. */
	#ratioOf(c: StudioClip): number {
		if (!c.warp) return 1;
		const uniform = warpUniformRatio(c.warp);
		if (uniform !== null) return uniform;
		const file = this.#fileSeconds(c);
		return file > 0 ? warpContentAt(c.warp, file) / file : 1;
	}
	/**
	 * Every content second of the clip `factor` times as long, the overall
	 * stretch kept within the hand range: the offset, duration and loop ride
	 * the content, so the clip keeps playing what it played, longer or shorter.
	 */
	#scaleClip(c: StudioClip, factor: number): boolean {
		this.#commit();
		if (!this.#scaleClipBy(c, factor)) return false;
		this.#reschedule();
		return true;
	}
	/** The scaling itself, inside a caller's undo step and without a reschedule. */
	#scaleClipBy(c: StudioClip, factor: number): boolean {
		const current = c.warp ?? uniformWarp(1, Math.max(1, this.#fileSeconds(c)));
		const have = this.#ratioOf(c);
		const ratio = Math.max(WARP_RATIO_MIN, Math.min(WARP_RATIO_MAX, have * factor));
		const f = ratio / have;
		if (!(f > 0) || Math.abs(f - 1) < 1e-6) return false;
		const next = scaleWarp(current, f);
		c.offset = round4(c.offset * f);
		c.duration = round4(Math.max(0.01, c.duration * f));
		if (c.loop) c.loop = { start: round4(c.loop.start * f), end: round4(c.loop.end * f) };
		c.fadeIn = Math.min(c.fadeIn, c.duration / 2);
		c.fadeOut = Math.min(c.fadeOut, c.duration / 2);
		const r = warpUniformRatio(next);
		if (r !== null && Math.abs(r - 1) < 1e-6) delete c.warp;
		else c.warp = next;
		return true;
	}
	/**
	 * Warp markers (docs/multitrack-recorder.md "Warping a clip", editing
	 * markers): one added at content second `at`, pinned where the map has
	 * the file (a plain clip gets a straight warp over its file to hold it),
	 * so nothing moves until it is dragged.
	 */
	addWarpPoint(clipId: string, at: number): boolean {
		const c = this.#clip(clipId);
		if (!c?.sourceId) return false;
		const next = warpWithPoint(c.warp ?? uniformWarp(1, Math.max(1, this.#fileSeconds(c))), at);
		if (!next) return false;
		this.#commit();
		c.warp = next;
		this.#reschedule();
		return true;
	}
	/** The marker `index` dragged to content second `at`: the audio on either side of it stretches to follow; the clip's own window stays. */
	moveWarpPoint(clipId: string, index: number, at: number): boolean {
		const c = this.#clip(clipId);
		if (!c?.warp) return false;
		const next = warpWithPointMoved(c.warp, index, at);
		if (!next) return false;
		this.#commit();
		c.warp = next;
		this.#reschedule();
		return true;
	}
	/** The marker `index` taken out, its neighbors' stretches joining; the last pair gone takes the warp with it. */
	removeWarpPoint(clipId: string, index: number): boolean {
		const c = this.#clip(clipId);
		if (!c?.warp?.[index]) return false;
		const next = warpWithoutPoint(c.warp, index);
		if (!next) {
			this.setClipWarp(clipId, null);
			return true;
		}
		this.#commit();
		c.warp = next;
		this.#reschedule();
		return true;
	}
	/** Switched off (docs/multitrack-recorder.md, "Switched-off clips"): the clip stays, dimmed, and plays nothing. */
	setClipMuted(clipId: string, muted: boolean) {
		const c = this.#clip(clipId);
		if (!c || !!c.muted === muted) return;
		this.#commit();
		if (muted) c.muted = true;
		else delete c.muted;
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
		// A take not heard since the song opened is cold: fetched now, and the pass restarted once it is in.
		if (!this.#buffers.has(next)) void this.ensureSource(next).then(() => this.#reschedule());
		const srcEnd = this.#sourceSeconds(c);
		if (c.offset >= srcEnd) c.offset = 0;
		if (!c.loop) c.duration = round4(Math.min(c.duration, srcEnd - c.offset));
		this.#reschedule();
	}
	/** How many takes a clip holds (the chosen one included). */
	takesOf(clipId: string) {
		const c = this.#clip(clipId);
		return c ? 1 + (c.alternates?.length ?? 0) : 0;
	}

	// ── Editing depth (docs/dawn-daw-plan.md, D4) ──────────────────────────
	/** The shape of a clip's fades: a crossfade with a neighbor is equal power whatever this says. */
	setClipFadeShape(clipId: string, shape: StudioFadeShape) {
		const c = this.#clip(clipId);
		if (!c || (c.fadeShape ?? "linear") === shape) return;
		this.#commit();
		if (shape === "linear") delete c.fadeShape;
		else c.fadeShape = shape;
		this.#reschedule();
	}
	/** Several clips moved together by `dt` seconds and `rows` tracks (a multi-selection dragged): one undo step; none leaves the tracks or goes before zero. */
	moveClips(clipIds: string[], dt: number, rows = 0) {
		const clips = clipIds.map((id) => this.#clip(id)).filter((c): c is StudioClip => !!c);
		if (clips.length === 0 || (dt === 0 && rows === 0)) return;
		const tracks = this.arrangement.tracks;
		const indexOf = (c: StudioClip) => tracks.findIndex((t) => t.id === c.trackId);
		let shift = dt;
		for (const c of clips) shift = Math.max(shift, -c.start);
		let step = rows;
		for (const c of clips) {
			const i = indexOf(c);
			step = Math.max(-i, Math.min(tracks.length - 1 - i, step));
		}
		if (shift === 0 && step === 0) return;
		this.#commit();
		for (const c of clips) {
			c.start = round4(c.start + shift);
			if (step) c.trackId = tracks[indexOf(c) + step]!.id;
		}
		this.#reschedule();
	}
	/** Several clips removed in one step; `ripple` closes the gaps they leave (utils/rippleDelete.ts). */
	deleteClips(clipIds: string[], ripple = false) {
		const gone = new Set(clipIds);
		if (!this.arrangement.clips.some((c) => gone.has(c.id))) return;
		this.#commit();
		this.arrangement.clips = ripple
			? rippleDelete(this.arrangement.clips, gone)
			: this.arrangement.clips.filter((c) => !gone.has(c.id));
		for (const id of gone) this.#stopClip(id);
		if (ripple) this.#reschedule();
	}
	/**
	 * A range of time cut out of every track (docs/dawn-daw-plan.md, D4;
	 * utils/rangeDelete.ts): the clips' parts inside [from, to) go, one
	 * undo step. With `ripple` the gap closes: the clips, markers, tempo,
	 * meter and key changes, automation points and loop region at or after
	 * `to` move earlier by the range's length, and the automation points
	 * inside it go. False, with nothing changed, for a range under a
	 * millisecond or one that would split past the clip limit.
	 */
	deleteRange(from: number, to: number, ripple = false): boolean {
		const a = Math.max(0, Math.min(from, to));
		const b = Math.max(from, to);
		if (b - a < 0.001) return false;
		const touched = (c: StudioClip) => c.start < b && c.start + c.duration > a;
		if (!ripple && !this.arrangement.clips.some(touched)) return false;
		const before = this.arrangement.clips.map((c) => c.id);
		const clips = rangeDelete($state.snapshot(this.arrangement.clips), a, b, ripple, localId);
		return this.#applyRange(before, clips, () => {
			if (ripple) this.#shiftTimeline(a, b, -(b - a));
		});
	}
	/**
	 * Silence inserted at `at` on every track (docs/dawn-daw-plan.md, D4;
	 * utils/rangeInsert.ts), one undo step: clips at or after it move later
	 * by `seconds`, a clip across it splits there, and the markers, tempo,
	 * meter and key changes, automation points and loop region at or after
	 * it move with them. False, with nothing changed, under a millisecond or
	 * past the clip limit.
	 */
	insertRange(at: number, seconds: number): boolean {
		const t = Math.max(0, at);
		if (seconds < 0.001) return false;
		const before = this.arrangement.clips.map((c) => c.id);
		const clips = rangeInsert($state.snapshot(this.arrangement.clips), t, seconds, localId);
		return this.#applyRange(before, clips, () => this.#shiftTimeline(t, t, seconds));
	}
	#applyRange(before: string[], clips: StudioClip[], shift: () => void): boolean {
		if (clips.length > MAX_STUDIO_CLIPS) {
			this.notice = `A song holds at most ${MAX_STUDIO_CLIPS} clips.`;
			return false;
		}
		this.#commit();
		// A clone per clip: the two pieces of a split share no arrays.
		this.arrangement.clips = clips.map((c) => structuredClone(c));
		shift();
		const kept = new Set(clips.map((c) => c.id));
		for (const id of before) if (!kept.has(id)) this.#stopClip(id);
		this.#reschedule();
		return true;
	}
	/** The arrangement's timed lists after a range edit (utils/shiftTimes.ts): items in [from, to) go (automation points only), those at or after `to` move by `by`. */
	#shiftTimeline(from: number, to: number, by: number) {
		const a = this.arrangement;
		if (a.markers?.length) a.markers = shiftTimes($state.snapshot(a.markers), "t", to, to, by);
		if (a.tempoChanges?.length)
			a.tempoChanges = shiftTimes($state.snapshot(a.tempoChanges), "start", to, to, by);
		if (a.meterChanges?.length)
			a.meterChanges = shiftTimes($state.snapshot(a.meterChanges), "start", to, to, by);
		if (a.keyChanges?.length)
			a.keyChanges = shiftTimes($state.snapshot(a.keyChanges), "start", to, to, by);
		const lanes = (auto: StudioAutomation | undefined): StudioAutomation | undefined => {
			if (!auto) return auto;
			const out: StudioAutomation = {};
			for (const [key, points] of Object.entries($state.snapshot(auto)))
				if (points.length) {
					const next = shiftTimes(points, "t", from, to, by);
					if (next.length) out[key] = next;
				}
			return Object.keys(out).length ? out : undefined;
		};
		for (const t of a.tracks) if (t.automation) t.automation = lanes(t.automation);
		for (const bus of a.buses ?? []) if (bus.automation) bus.automation = lanes(bus.automation);
		if (a.masterAutomation) a.masterAutomation = lanes(a.masterAutomation);
		const loop = a.loop;
		if (loop && loop.start >= to - 1e-6)
			a.loop = {
				...loop,
				start: round4(Math.max(0, loop.start + by)),
				end: round4(Math.max(0, loop.end + by)),
			};
	}
	/**
	 * Comping: the region [from, to] of a clip taken from one of its takes
	 * (utils/compRegion.ts): the clip becomes up to three pieces, the
	 * middle playing the take, overlapping their neighbors by a short
	 * equal-power crossfade. Returns the middle piece.
	 */
	compFromTake(clipId: string, takeSourceId: string, from: number, to: number): StudioClip | null {
		const c = this.#clip(clipId);
		if (!c) return null;
		const pieces = compRegion(structuredClone($state.snapshot(c)), takeSourceId, from, to);
		if (!pieces) return null;
		if (this.arrangement.clips.length - 1 + pieces.length > MAX_STUDIO_CLIPS) {
			this.notice = `A song holds at most ${MAX_STUDIO_CLIPS} clips.`;
			return null;
		}
		this.#commit();
		const made = pieces.map((p) => ({ ...p, id: localId() }));
		const i = this.arrangement.clips.findIndex((x) => x.id === clipId);
		this.arrangement.clips.splice(i, 1, ...made);
		this.#stopClip(clipId);
		this.#reschedule();
		if (!this.#buffers.has(takeSourceId))
			void this.ensureSource(takeSourceId).then(() => this.#reschedule());
		return made.find((m) => m.sourceId === takeSourceId) ?? made[0]!;
	}
	/** A new source from channel data, held here and handed to the page to upload (as an import is). */
	#sourceFromChannels(
		channels: Float32Array[],
		sampleRate: number,
		label: string,
		trackId: string,
	): { sourceId: string; buffer: AudioBuffer } {
		const length = Math.max(1, channels[0]?.length ?? 1);
		const buffer = new AudioBuffer({ numberOfChannels: channels.length || 1, length, sampleRate });
		channels.forEach((ch, i) => buffer.copyToChannel(ch as Float32Array<ArrayBuffer>, i));
		const sourceId = nanoid();
		this.#buffers.set(sourceId, buffer);
		// On disk before the upload finishes, so a reload while it is still going reads it back (audio/pcmCache.ts).
		void pcmCache.write(sourceId, buffer);
		this.sources[sourceId] = {
			id: sourceId,
			label,
			durationSeconds: buffer.duration,
			sampleRate,
			channels: buffer.numberOfChannels,
			peaks: computePeaks(buffer, 1024),
			status: "ready",
			pending: true,
		};
		this.#recount();
		this.ontake?.({
			sourceId,
			trackId,
			trackLabel: label,
			takeNumber: 0,
			kind: "import",
			buffer,
			blob: new Blob([encodeWav24(channels, sampleRate)], { type: "audio/wav" }),
			filename: `${label}.wav`,
			durationSeconds: buffer.duration,
		});
		return { sourceId, buffer };
	}
	/** The clip's span of its source as plain channels (a looped clip's passes laid end to end), for a tool that makes a new source of it. */
	#clipChannels(c: StudioClip): { channels: Float32Array[]; sampleRate: number } | null {
		const buffer = this.clipBufferOf(c);
		if (!buffer) return null;
		const sr = buffer.sampleRate;
		const spans = clipSegments(c)
			.map((seg) => ({
				a: Math.max(0, Math.round(seg.offset * sr)),
				b: Math.min(buffer.length, Math.round((seg.offset + seg.duration) * sr)),
			}))
			.filter((x) => x.b > x.a);
		const total = spans.reduce((n, x) => n + (x.b - x.a), 0);
		if (!total) return null;
		return {
			channels: Array.from({ length: buffer.numberOfChannels }, (_, ch) => {
				const data = buffer.getChannelData(ch);
				const out = new Float32Array(total);
				let at = 0;
				for (const x of spans) {
					out.set(data.subarray(x.a, x.b), at);
					at += x.b - x.a;
				}
				return out;
			}),
			sampleRate: sr,
		};
	}
	/** The clip on a new source made of its span (reversed, normalized): its takes stay behind it only when `keepTakes`. */
	#replaceClipSource(c: StudioClip, channels: Float32Array[], sampleRate: number, suffix: string) {
		const label = `${c.name || "Clip"} (${suffix})`.slice(0, 60);
		const { sourceId, buffer } = this.#sourceFromChannels(channels, sampleRate, label, c.trackId);
		this.#commit();
		c.sourceId = sourceId;
		c.offset = 0;
		c.duration = round4(buffer.duration);
		delete c.alternates;
		delete c.loop;
		// The new recording is the clip's content as it played, warp and all: nothing left to warp.
		delete c.warp;
		c.name = label;
		this.#reschedule();
	}
	/** The clip's audio back to front, as a new recording of its own. */
	reverseClip(clipId: string): boolean {
		const c = this.#clip(clipId);
		const got = c && this.#clipChannels(c);
		if (!c || !got) return false;
		this.#replaceClipSource(c, reverseChannels(got.channels), got.sampleRate, "reversed");
		return true;
	}
	/** The clip's audio brought up to −1 dBFS, as a new recording of its own (a clip already there, or near silence, is left). */
	normalizeClip(clipId: string): boolean {
		const c = this.#clip(clipId);
		const got = c && this.#clipChannels(c);
		if (!c || !got) return false;
		const buffer = new AudioBuffer({
			numberOfChannels: got.channels.length,
			length: got.channels[0]!.length,
			sampleRate: got.sampleRate,
		});
		got.channels.forEach((ch, i) => buffer.copyToChannel(ch as Float32Array<ArrayBuffer>, i));
		if (normalizeBuffer(buffer) === 1) return false;
		this.#replaceClipSource(
			c,
			Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i)),
			got.sampleRate,
			"normalized",
		);
		return true;
	}
	/** Clips of one track rendered into one new recording that replaces them (gains, fades and crossfades baked in); null when they span tracks. */
	consolidateClips(clipIds: string[]): StudioClip | null {
		const clips = clipIds
			.map((id) => this.#clip(id))
			.filter((c): c is StudioClip => !!c && !!c.sourceId);
		if (clips.length === 0 || new Set(clips.map((c) => c.trackId)).size !== 1) return null;
		const from = Math.min(...clips.map((c) => c.start));
		const to = Math.max(...clips.map((c) => c.start + c.duration));
		const sampleRate = this.sampleRate;
		const channels = mixClipsToChannels(
			structuredClone($state.snapshot(clips)),
			(id, clip) => {
				const b = clip ? this.clipBufferOf(clip) : this.#buffers.get(id);
				return b
					? {
							channels: Array.from({ length: b.numberOfChannels }, (_, i) => b.getChannelData(i)),
							sampleRate: b.sampleRate,
						}
					: null;
			},
			{ from, to, sampleRate },
		);
		const first = [...clips].sort((a, b) => a.start - b.start)[0]!;
		const label = `${first.name || "Clip"} (consolidated)`.slice(0, 60);
		const { sourceId, buffer } = this.#sourceFromChannels(
			channels,
			sampleRate,
			label,
			first.trackId,
		);
		this.#commit();
		const gone = new Set(clips.map((c) => c.id));
		const made: StudioClip = {
			id: localId(),
			trackId: first.trackId,
			sourceId,
			start: round4(from),
			offset: 0,
			duration: round4(buffer.duration),
			gain: 1,
			fadeIn: 0,
			fadeOut: 0,
			name: label,
		};
		const i = this.arrangement.clips.findIndex((c) => c.id === first.id);
		this.arrangement.clips = this.arrangement.clips.filter((c) => !gone.has(c.id));
		this.arrangement.clips.splice(Math.min(i, this.arrangement.clips.length), 0, made);
		for (const id of gone) this.#stopClip(id);
		this.#reschedule();
		return made;
	}

	// ── Freeze (D8) ───────────────────────────────────────────────────────
	/**
	 * A track frozen: its clips (and a MIDI track's notes) rendered through
	 * its inserts into one recording that takes their place, the inserts
	 * put away, so a heavy track costs nothing to play. The fader, pan and
	 * their lanes stay live. Unfreeze brings the clips and inserts back.
	 */
	async freezeTrack(trackId: string): Promise<boolean> {
		const t = this.#track(trackId);
		if (!t || t.frozen) return false;
		const clips = this.arrangement.clips.filter((c) => c.trackId === trackId);
		if (clips.length === 0) return false;
		const buffer = await this.render({ track: trackId, freeze: true });
		const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) =>
			buffer.getChannelData(c),
		);
		const label = `${t.name || "Track"} (frozen)`.slice(0, 60);
		const { sourceId } = this.#sourceFromChannels(channels, buffer.sampleRate, label, trackId);
		this.#commit();
		const track = this.#track(trackId)!;
		track.frozen = {
			clips: structuredClone($state.snapshot(clips)),
			...(track.inserts ? { inserts: track.inserts } : {}),
			...(track.fx ? { fx: track.fx } : {}),
		};
		delete track.inserts;
		delete track.fx;
		const gone = new Set(clips.map((c) => c.id));
		this.arrangement.clips = this.arrangement.clips.filter((c) => !gone.has(c.id));
		this.arrangement.clips.push({
			id: localId(),
			trackId,
			sourceId,
			start: 0,
			offset: 0,
			duration: round4(buffer.duration),
			gain: 1,
			fadeIn: 0,
			fadeOut: 0,
			name: label,
		});
		for (const id of gone) this.#stopClip(id);
		this.#tracks.get(trackId)?.setInserts([], 0);
		this.#reschedule();
		return true;
	}
	/** The frozen track's clips and inserts back as they were; the rendering stays a recording of the song until a clean-up. */
	unfreezeTrack(trackId: string): boolean {
		const t = this.#track(trackId);
		if (!t?.frozen) return false;
		this.#commit();
		const track = this.#track(trackId)!;
		const frozen = track.frozen!;
		const rendered = this.arrangement.clips.filter((c) => c.trackId === trackId);
		this.arrangement.clips = [
			...this.arrangement.clips.filter((c) => c.trackId !== trackId),
			...structuredClone($state.snapshot(frozen.clips)),
		];
		if (frozen.inserts) track.inserts = frozen.inserts;
		if (frozen.fx) track.fx = frozen.fx;
		delete track.frozen;
		for (const c of rendered) this.#stopClip(c.id);
		this.#tracks.get(trackId)?.setInserts(this.#synced(insertsOf(track)), 0);
		for (const c of frozen.clips)
			if (c.sourceId && !this.#buffers.has(c.sourceId))
				void this.ensureSource(c.sourceId).then(() => this.#reschedule());
		this.#reschedule();
		return true;
	}

	// ── Markers (D4) ──────────────────────────────────────────────────────
	get markers(): StudioMarker[] {
		return this.arrangement.markers ?? [];
	}
	/**
	 * The song's sections: each section marker in time order, running to the
	 * next one or to the song's end (the last clip's), never backward.
	 */
	get sections(): { id: string; name: string; start: number; end: number }[] {
		const opens = this.markers.filter((m) => m.section).sort((a, b) => a.t - b.t);
		const songEnd = this.duration;
		return opens.map((m, i) => ({
			id: m.id,
			name: m.name,
			start: m.t,
			end: opens[i + 1]?.t ?? Math.max(songEnd, m.t),
		}));
	}
	/** A marker at `t`; `section` makes it open a section. */
	addMarker(t = this.position, name?: string, section?: boolean): StudioMarker | null {
		if (this.markers.length >= MAX_STUDIO_MARKERS) {
			this.notice = `A song holds at most ${MAX_STUDIO_MARKERS} markers.`;
			return null;
		}
		this.#commit();
		const marker: StudioMarker = {
			id: localId(),
			t: round4(Math.max(0, t)),
			name:
				name ??
				`${section ? "Section" : "Marker"} ${this.markers.filter((m) => !!m.section === !!section).length + 1}`,
		};
		if (section) marker.section = true;
		this.arrangement.markers = [...this.markers, marker].sort((a, b) => a.t - b.t);
		return marker;
	}
	moveMarker(id: string, t: number) {
		const m = this.markers.find((x) => x.id === id);
		if (!m || m.t === t) return;
		this.#commit();
		m.t = round4(Math.max(0, t));
		this.arrangement.markers = [...this.markers].sort((a, b) => a.t - b.t);
	}
	renameMarker(id: string, name: string) {
		const m = this.markers.find((x) => x.id === id);
		const next = name.trim().slice(0, 40);
		if (!m || !next || m.name === next) return;
		this.#commit();
		m.name = next;
	}
	/** A marker opens a section, or stops opening one (one undo step). */
	toggleMarkerSection(id: string) {
		const m = this.markers.find((x) => x.id === id);
		if (!m) return;
		this.#commit();
		if (m.section) delete m.section;
		else m.section = true;
	}
	deleteMarker(id: string) {
		if (!this.markers.some((x) => x.id === id)) return;
		this.#commit();
		this.arrangement.markers = this.markers.filter((x) => x.id !== id);
	}
	/** The marker after (or before) a time, for jumping; null at the ends. */
	markerFrom(t: number, step: 1 | -1): StudioMarker | null {
		const list = this.markers;
		if (step === 1) return list.find((m) => m.t > t + 0.001) ?? null;
		return [...list].reverse().find((m) => m.t < t - 0.001) ?? null;
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
		// Each note onto the grid as it stands at that moment (tempo changes included), in the clip's own time.
		const origin = c.start - c.offset;
		const grid = this.grid;
		c.notes = c.notes
			.map((n) => ({
				...n,
				t: round4(Math.max(0, snapToBeat(grid, origin + n.t, division) - origin)),
			}))
			.sort((a, b) => a.t - b.t || a.p - b.p);
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
		if (!t || !source || !isInstrument(source) || !ctx) return;
		INSTRUMENTS[source].audition({ pitch, velocity, duration }, t);
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
		const lanes = lanesFromMidiSummary(summary, end);
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
			...(lanes.length ? { lanes } : {}),
		});
	}
	/** A MIDI clip's notes (what the clip shows of them) as a Standard MIDI File at the song's tempo. */
	midiBlobOf(clipId: string): Blob | null {
		const c = this.#clip(clipId);
		if (!c?.notes) return null;
		const track = this.#track(c.trackId);
		// What the clip plays (a looped clip's repeats too), as notes from the clip's start.
		const played = clipNoteEvents({ ...c, gain: 1 }).map((e) => ({
			t: e.at - c.start,
			d: e.duration,
			p: e.pitch,
			v: e.velocity,
		}));
		return notesToMidiBlob(
			played,
			{
				bpm: this.arrangement.bpm,
				beatsPerBar: this.arrangement.beatsPerBar,
				drums: track?.input?.source === "drums",
			},
			clipLaneEvents(c).map((e) => ({ ...e, at: e.at - c.start })),
		);
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
		lanes: StudioClipLane[] = [],
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
			anchor: "beats",
			start: round4(start),
			offset: 0,
			duration: round4(duration),
			gain: 1,
			fadeIn: 0,
			fadeOut: 0,
			name,
			...(lanes.length ? { lanes } : {}),
		});
	}
	/** A notes clip's expression lanes replaced (the roll's lane editor): one undo step per gesture. */
	setClipLanes(clipId: string, lanes: StudioClipLane[]) {
		const c = this.#clip(clipId);
		if (!c?.notes) return;
		this.#commit();
		if (lanes.length)
			c.lanes = lanes.map((l) => ({ ...l, points: [...l.points].sort((a, b) => a.t - b.t) }));
		else delete c.lanes;
		this.#reschedule();
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
		const clips = this.arrangement.clips.filter(
			(c) => c.trackId === trackId && c.notes?.length && !c.muted,
		);
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
		/** The file's own rate (utils/audioSampleRate.ts); the buffer is at the context's. */
		fileSampleRate?: number,
	): StudioTake | null {
		if (this.arrangement.clips.length >= MAX_STUDIO_CLIPS) {
			this.notice = `A song holds at most ${MAX_STUDIO_CLIPS} clips.`;
			return null;
		}
		const sourceId = nanoid();
		const label = file.filename.replace(/\.[a-z0-9]+$/i, "").slice(0, 60) || "Import";
		this.#buffers.set(sourceId, buffer);
		void pcmCache.write(sourceId, buffer);
		this.sources[sourceId] = {
			id: sourceId,
			label,
			durationSeconds: buffer.duration,
			sampleRate: fileSampleRate ?? buffer.sampleRate,
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
	/**
	 * A decoded file as a source under an id the caller minted, without a clip
	 * (a DAWproject's audio, docs/dawproject-plan.md: the arrangement that
	 * names it is replaced afterwards). The take goes to the queue as an
	 * import does.
	 */
	adoptSource(
		sourceId: string,
		buffer: AudioBuffer,
		file: { blob: Blob; filename: string },
		trackLabel: string,
		/** The file's own rate (utils/audioSampleRate.ts); the buffer is at the context's. */
		fileSampleRate?: number,
	): StudioTake {
		this.#buffers.set(sourceId, buffer);
		void pcmCache.write(sourceId, buffer);
		this.sources[sourceId] = {
			id: sourceId,
			label: trackLabel.slice(0, 60) || "Import",
			durationSeconds: buffer.duration,
			sampleRate: fileSampleRate ?? buffer.sampleRate,
			channels: buffer.numberOfChannels,
			peaks: computePeaks(buffer, 1024),
			status: "ready",
			pending: true,
		};
		this.#recount();
		return {
			sourceId,
			trackId: "",
			trackLabel: trackLabel.slice(0, 60) || "Import",
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
	/** The master fader's level: unity while its volume lane drives (the `auto` node has the level), else the knob's. */
	#masterGain() {
		return this.arrangement.masterAutomation?.volume?.length ? 1 : this.arrangement.master;
	}
	/** The master as a strip's owner for the lane code: its level, no pan, its inserts and its own lanes. */
	#masterOwner(): LaneOwner {
		return {
			gain: this.arrangement.master,
			pan: 0,
			automation: this.arrangement.masterAutomation,
			inserts: this.arrangement.masterInserts,
		};
	}
	/** A strip's owner by id: a track, a bus, or the master ("master"). */
	#owner(ownerId: string): LaneOwner | null {
		if (ownerId === "master") return this.#masterOwner();
		return this.#track(ownerId) ?? this.#bus(ownerId);
	}
	/** A strip's lanes replaced: on the track or bus, or on the arrangement for the master. */
	#setOwnerAutomation(ownerId: string, automation: StudioAutomation | undefined) {
		if (ownerId === "master") this.arrangement.masterAutomation = automation;
		else {
			const owner = this.#track(ownerId) ?? this.#bus(ownerId);
			if (owner) owner.automation = automation;
		}
	}
	/** Whether a parameter of a track is driven by a lane (docs/dawn-daw-plan.md, D1). */
	/** Whether a parameter of a strip is driven by a lane (docs/dawn-daw-plan.md, D1 and D2); `ownerId` a track's or a bus's. */
	hasAutomation(ownerId: string, key: string): boolean {
		return !!this.#owner(ownerId)?.automation?.[key]?.length;
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
		const owner = this.#owner(ownerId);
		if (!owner) return 0;
		const choice = this.lanesOf(ownerId).find((l) => l.key === key);
		const fallback = choice?.fallback ?? 0;
		const lane = owner.automation?.[key];
		return lane?.length ? automationValueAt(lane, seconds, fallback, choice?.range.step) : fallback;
	}
	/** The lanes a strip can show (utils/automationLanes.ts), from its state now; "master" for the master's. */
	lanesOf(ownerId: string) {
		if (ownerId === "master")
			return automationLanes({
				gain: this.arrangement.master,
				inserts: this.arrangement.masterInserts ?? [],
				buses: [],
			});
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
		owner: { automation?: StudioAutomation; inserts?: StudioInsert[] },
		strip: StripGraph,
		from: number,
		when: number,
		to: number | null,
	) {
		for (const [key, lane] of Object.entries(owner.automation ?? {})) {
			const param = strip.param(key);
			if (param && lane.length)
				scheduleAutomation(param, lane, { from, when, to, fallback: 0, ...laneTransfer(key) });
		}
		// A synced delay's time follows the tempo map through the pass: set at the start, then at every tempo step and ramp beat.
		const grid = this.grid;
		for (const insert of owner.inserts ?? []) {
			const sync = typeof insert.settings.sync === "number" ? insert.settings.sync : 0;
			if (insert.kind !== "delay" || insert.bypass || !(sync > 0)) continue;
			const param = strip.param(insertLaneKey(insert.id, "time"));
			if (!param) continue;
			param.cancelScheduledValues(when);
			param.setValueAtTime(delaySyncSeconds(sync, tempoAt(grid, from)), when);
			for (const t of this.#tempoSteps(grid, from, to ?? Infinity))
				param.setValueAtTime(delaySyncSeconds(sync, tempoAt(grid, t)), when + (t - from));
		}
	}
	/** Where the tempo or the meter moves within (from, to): each change's start and every beat of a ramp. */
	#tempoSteps(grid: BarGrid, from: number, to: number): number[] {
		return [
			...this.tempoChanges.map((c) => c.start),
			...this.meterChanges.map((c) => c.start),
			...this.#rampBeats(grid, from, to),
		].filter((t, i, list) => t > from && t < to && list.indexOf(t) === i);
	}
	/** The lanes of a track scheduled for a pass: song second `from` at context time `when`, to `to` (null: the end). */
	/** The lanes at rest: every curve canceled and each param at its value for the playhead (or its static value without a lane). */
	/**
	 * The strip's lanes at rest (a stop, a seek, an edit while stopped):
	 * every curve canceled, the statics put back (the fader's unity on the
	 * volume node, the pan, the sends, the inserts' settings), then each
	 * lane's param at its value for the playhead.
	 */
	#settleAutomation(owner: LaneOwner, strip: StripGraph, now: number) {
		const lanes = owner.automation ?? {};
		strip.auto.gain.cancelScheduledValues(now);
		strip.mute.gain.cancelScheduledValues(now);
		strip.pan.pan.cancelScheduledValues(now);
		if (!lanes.volume?.length) strip.auto.gain.setValueAtTime(1, now);
		if (!lanes.mute?.length) strip.mute.gain.setValueAtTime(1, now);
		if (!lanes.pan?.length) strip.pan.pan.setValueAtTime(owner.pan, now);
		for (const [busId, gain] of strip.sends) {
			gain.gain.cancelScheduledValues(now);
			if (lanes[sendLaneKey(busId)]?.length) continue;
			gain.gain.setValueAtTime(owner.sends?.find((s) => s.bus === busId)?.level ?? 0, now);
		}
		strip.setInserts(this.#synced(insertsOf(owner)), 0);
		for (const [key, lane] of Object.entries(lanes)) {
			const param = strip.param(key);
			if (!param || !lane.length) continue;
			const { scale, hold } = laneTransfer(key);
			param.cancelScheduledValues(now);
			param.setValueAtTime(scale(automationValueAt(lane, this.position, 0, hold)), now);
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
		if (this.#masterStrip)
			this.#settleAutomation(this.#masterOwner(), this.#masterStrip, ctx.currentTime);
	}

	/** A lane replaced whole (the lane component's gesture), one undo step; an empty lane is removed. */
	/** A lane replaced whole (the lane component's gesture), one undo step; an empty lane is removed. `ownerId` a track's or a bus's. */
	setAutomation(ownerId: string, key: string, points: StudioAutomationPoint[]) {
		const owner = this.#owner(ownerId);
		if (!owner) return;
		this.#commit();
		const automation = { ...owner.automation };
		if (points.length) automation[key] = points;
		else delete automation[key];
		this.#setOwnerAutomation(ownerId, Object.keys(automation).length ? automation : undefined);
		this.#afterLaneChange(ownerId);
	}
	/** A knob touched on a track with a lane: a point at the playhead takes the value (docs/dawn-daw-plan.md, D1: touch write). */
	/** A knob touched on a strip whose lane exists: a point at the playhead takes the value (docs/dawn-daw-plan.md, D1: touch write). */
	writeAutomation(ownerId: string, key: string, value: number) {
		const owner = this.#owner(ownerId);
		const lane = owner?.automation?.[key];
		if (!owner || !lane?.length) return false;
		const range = this.lanesOf(ownerId).find((l) => l.key === key)?.range;
		if (!range) return false;
		this.#commitMixGesture();
		const edited = editAutomation(lane, { kind: "add", t: this.position, v: value }, range);
		this.#setOwnerAutomation(ownerId, { ...owner.automation, [key]: edited.points });
		this.#afterLaneChange(ownerId);
		return true;
	}
	#afterLaneChange(ownerId: string) {
		this.dirty = true;
		const ctx = this.#ctx;
		const owner = this.#owner(ownerId);
		const strip = this.#graph?.stripOf(ownerId) ?? null;
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
		if (this.#masterStrip) set(this.#masterStrip.fader.gain, this.#masterGain());
	}

	// ── Transport ──────────────────────────────────────────────────────────
	/** Play from the playhead (or `from`), after a count-in when `countIn` asks for one. */
	async play(opts: { from?: number; countIn?: boolean; ahead?: number } = {}): Promise<void> {
		if (this.running) return;
		await this.open();
		await this.ensureReferenced();
		const ctx = this.#ctx!;
		claimPlayback(this.#transport);
		// The instruments MIDI clips play through must be awake before their first note is due.
		const midiSources = new Set(
			this.midiTracksWithClips.map((t) => t.input!.source as StudioInstrument),
		);
		for (const s of midiSources) await INSTRUMENTS[s].prepare();
		const from = opts.from ?? this.position;
		const ahead = opts.ahead ?? START_AHEAD;
		const grid = this.grid;
		const countIn = opts.countIn ? barSecondsAt(grid, from) : 0;
		const when = ctx.currentTime + ahead + countIn;
		this.#stopAt = from;
		this.#passes = [];
		this.#clipQueue = [];
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
			metronome.setBpm(tempoAt(grid, from));
			metronome.setBeats(beatsPerBarAt(grid, from));
			metronome.setBeatUnit(beatUnitAt(grid, from));
			// The click runs from the count-in; on the grid its downbeats fall on the song's bars (the bar the start is in, on the tempo map).
			const bar = barSecondsAt(grid, from);
			const intoBar = from - secondsAtBar(grid, barAt(grid, from).bar);
			const firstBeat = opts.countIn ? when - countIn : when - intoBar;
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
		if (this.#masterStrip)
			this.#scheduleLanes(this.#masterOwner(), this.#masterStrip, from, when, to);
		const fades = clipCrossfades(this.arrangement.clips);
		const due: QueuedSegment[] = [];
		for (const clip of this.arrangement.clips)
			due.push(...this.#clipSegmentsIn(clip, from, when, to, fades.get(clip.id)));
		this.#clipQueue = [...this.#clipQueue, ...due].sort((a, b) => a.at - b.at);
		this.#startClipsUntil(when + STUDIO_SCHEDULE_HORIZON_S);
		this.#queueMidi(from, when, to);
	}
	/** Starts the queued clip segments due before `until`. */
	#startClipsUntil(until: number) {
		const q = this.#clipQueue;
		let n = 0;
		while (n < q.length && q[n].at <= until) this.#startSegment(q[n++]);
		if (n) this.#clipQueue = q.slice(n);
	}
	/** Every note of every MIDI clip that falls in [from, to), queued for the look-ahead from `when`; the first moments fire now. */
	#queueMidi(from: number, when: number, to: number | null) {
		const ctx = this.#ctx;
		if (!ctx) return;
		const queue: QueuedNote[] = [];
		const grid = this.grid;
		for (const clip of this.arrangement.clips) {
			if (!clip.notes?.length || clip.muted) continue;
			const track = this.#track(clip.trackId);
			const source = track?.input?.source;
			if (!track || track.kind !== "midi" || !source || !isInstrument(source)) continue;
			const clipEnd = clip.start + clip.duration;
			const ends = to === null ? clipEnd : Math.min(clipEnd, to);
			// The notes in the window, through the track's swing and humanize (utils/swingNotes.ts, D5).
			const events = swingNotes(clipNoteEvents(clip, from, ends), {
				grid,
				swing: track.swing,
				humanize: track.humanize,
			});
			for (const e of events) {
				const at = when + (e.at - from);
				queue.push({
					at,
					clipId: clip.id,
					fired: false,
					fire: () => {
						const t = this.#track(track.id);
						const gain = t ? this.#effectiveGain(t) : 0;
						if (gain <= 0) return null;
						const velocity = Math.min(1, e.velocity * Math.min(1, gain));
						return INSTRUMENTS[source].scheduleNote(
							{ pitch: e.pitch, velocity, at, duration: e.duration },
							t ?? track,
						);
					},
				});
			}
			// The clip's expression lanes (utils/clipLaneEvents.ts): the pedal, the wheels and the bend, through the instrument on the same clock.
			const instrument = INSTRUMENTS[source];
			if (instrument.scheduleControl)
				for (const e of clipLaneEvents(clip, from, ends)) {
					const at = when + (e.at - from);
					queue.push({
						at,
						clipId: clip.id,
						fired: false,
						fire: () => {
							instrument.scheduleControl?.({ ...e, at }, this.#track(track.id) ?? track);
							return null;
						},
					});
				}
		}
		// Tempo and meter changes in the window: the click (and the drums playing along) pick up the new pace on the beat they land on.
		// Through a ramp, every beat line is such a moment: the click follows the tempo as it moves.
		const ends = to ?? Infinity;
		for (const t of this.#tempoSteps(grid, from, ends)) {
			const at = when + (t - from);
			queue.push({
				at,
				clipId: "",
				fired: false,
				fire: () => {
					const bpm = tempoAt(grid, t);
					const bpb = beatsPerBarAt(grid, t);
					if (metronome.running) {
						metronome.stop();
						metronome.setBpm(bpm);
						metronome.setBeats(bpb);
						metronome.setBeatUnit(beatUnitAt(grid, t));
						void metronome.startAt(at);
					}
					if (this.#startedDrums && !drumMachine.followTempo) drumMachine.setBpm(bpm);
					return null;
				},
			});
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
	/** The segments of an audio clip that sound in the pass [from, to) begun at `when`, each with the context time it starts at. */
	#clipSegmentsIn(
		clip: StudioClip,
		from: number,
		when: number,
		to: number | null,
		fades?: EffectiveFades,
	): QueuedSegment[] {
		if (!clip.sourceId) return []; // a MIDI clip: its notes are queued by #queueMidi
		const buffer = this.clipBufferOf(clip);
		if (clip.muted || !this.#ctx || !buffer || !this.#tracks.has(clip.trackId)) return [];
		// Fades: the clip's own at its edges (widened over an overlap into a crossfade, utils/clipCrossfades.ts), else a few milliseconds so a cut never clicks.
		const f = fades ?? fadesOf(clip);
		// A source per pass of the clip (utils/clipSegments.ts): one for a clip without a loop, the loop's repeats for one with; those in the pass.
		return clipSegments(clip)
			.filter((seg) => seg.start + seg.duration > from && (to === null || seg.start < to))
			.map((seg) => ({
				at: when + (Math.max(seg.start, from) - from),
				clip,
				buffer,
				seg,
				from,
				when,
				to,
				fades: f,
			}));
	}
	/**
	 * A clip segment's source, started. Late (a starved timer let its moment
	 * pass), it starts now from where the pass has reached in it, so it stays
	 * in time with the rest.
	 */
	#startSegment({ clip, buffer, seg, from, when, to, fades: f }: QueuedSegment) {
		const ctx = this.#ctx;
		const nodes = this.#tracks.get(clip.trackId);
		if (!ctx || !nodes) return;
		const clipEnd = clip.start + clip.duration;
		const segEnd = seg.start + seg.duration;
		const begins = Math.max(seg.start, from, from + (ctx.currentTime - when));
		const ends = to === null ? segEnd : Math.min(segEnd, to);
		const offset = seg.offset + (begins - seg.start);
		const length = ends - begins;
		if (length <= 0 || offset >= buffer.duration) return;
		const src = ctx.createBufferSource();
		src.buffer = buffer;
		const gain = ctx.createGain();
		const at = when + (begins - from);
		// The gain envelope rides its own node before the fades (docs/multitrack-recorder.md "Clip gain envelopes").
		const env = envelopeNode(ctx, clip.gainEnvelope, at, offset, length);
		if (env) src.connect(env).connect(gain);
		else src.connect(gain);
		gain.connect(nodes.input);
		scheduleFades(gain.gain, clip.gain, at, length, {
			fadeIn: begins === clip.start ? Math.max(EDGE_FADE, f.fadeIn) : EDGE_FADE,
			fadeOut: ends === clipEnd ? Math.max(EDGE_FADE, f.fadeOut) : EDGE_FADE,
			inShape: f.inShape,
			outShape: f.outShape,
		});
		src.start(at, offset, Math.min(length, buffer.duration - offset));
		const entry: Playing = { clipId: clip.id, src, gain };
		src.onended = () => {
			this.#playing = this.#playing.filter((p) => p !== entry);
			env?.disconnect();
			gain.disconnect();
		};
		this.#playing.push(entry);
	}
	/** The look-ahead: when a loop pass ends within reach, the next pass is already queued. */
	#queueUntil = (until: number) => {
		this.#flushMidi(until);
		this.#startClipsUntil(until + STUDIO_SCHEDULE_HORIZON_S);
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
		this.#clipQueue = [];
		this.#passes = [];
		for (const v of this.#midiVoices) v.cancel();
		this.#midiVoices = [];
		this.#midiQueue = [];
		this.#midiNext = 0;
		for (const s of STUDIO_INSTRUMENTS) INSTRUMENTS[s].cancelScheduled();
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
		this.#clipQueue = this.#clipQueue.filter((x) => x.clip.id !== clipId);
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
		await this.ensureReferenced();
		const ctx = this.#ctx!;
		const armed = this.armedTracks.filter((t) => t.input && this.inputOpen(t.input.source));
		if (armed.length === 0) {
			this.notice = "Arm a track with an open input to record.";
			return false;
		}
		// The drums must be ready to start on the bar: the kit decoded before the start is chosen.
		for (const t of armed)
			if (t.input && isInstrument(t.input.source)) await INSTRUMENTS[t.input.source].prepare();
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
		if (isInstrument(source)) return INSTRUMENTS[source].output();
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
		const controls: LaneEvent[] = [];
		const push = (e: NoteEvent) => {
			events.push(e);
			this.liveTick++;
		};
		const offNotes = INSTRUMENTS[source].onNote(push);
		const offControls = INSTRUMENTS[source].onControl?.((e) => controls.push(e)) ?? (() => {});
		const off = () => {
			offNotes();
			offControls();
		};
		this.#midiCaptures.push({ trackId: track.id, source, events, controls, off });
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
			// The expression over the whole pass, from the same zero as the notes; sliced per piece below.
			const lanes = lanesFromEvents(cap.controls, when + shift, end);
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
				this.#landMidiClip(
					track,
					part,
					piece.start,
					piece.to - piece.from,
					name,
					sliceLanes(lanes, piece.from, piece.to),
				);
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
				: input && isInstrument(input.source)
					? INSTRUMENTS[input.source].latency === "output" && this.compensateInstruments
						? this.outputLatencyMs
						: 0
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
			void pcmCache.write(sourceId, buffer);
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
		this.#readLoudness(t);
		this.#meterFrame = requestAnimationFrame(this.#meter);
	};
	/** The LUFS readout from the taps: the channels' mean squares summed per frame, averaged over the last 400 ms and 3 s; cleared when the transport stops. */
	#readLoudness(t: number) {
		const buf = this.#loudnessBuf;
		if (!buf || this.#loudnessTaps.length === 0) return;
		if (!this.running) {
			if (this.#loudnessBlocks.length) {
				this.#loudnessBlocks = [];
				this.masterLoudness = { momentary: null, shortTerm: null };
			}
			return;
		}
		let ms = 0;
		for (const tap of this.#loudnessTaps) {
			tap.getFloatTimeDomainData(buf);
			let sq = 0;
			for (const x of buf) sq += x * x;
			ms += sq / buf.length;
		}
		const blocks = this.#loudnessBlocks;
		blocks.push({ t, ms });
		while (blocks.length && blocks[0]!.t < t - 3) blocks.shift();
		const over = (seconds: number) => {
			let sum = 0;
			let n = 0;
			for (const b of blocks)
				if (b.t >= t - seconds) {
					sum += b.ms;
					n++;
				}
			if (!n) return null;
			const lufs = lufsOf(sum / n);
			return lufs > LOUDNESS_ABSOLUTE_GATE_LUFS ? Math.round(lufs * 10) / 10 : null;
		};
		this.masterLoudness = { momentary: over(0.4), shortTerm: over(3) };
	}

	/** Forget a track's clip (or every track's and the master's, with no id); the lights go out. */
	resetClips(trackId?: string) {
		const next: Record<string, MeterState> = {};
		for (const [k, v] of Object.entries(this.levels))
			next[k] = trackId === undefined || k === trackId ? { ...v, clipped: false } : v;
		this.levels = next;
		if (trackId === undefined) this.masterLevel = { ...this.masterLevel, clipped: false };
	}

	// ── Bounce ─────────────────────────────────────────────────────────────
	/**
	 * The song rendered offline (docs/dawn-daw-plan.md, D3): the master, the
	 * buses and the tracks as the live graph has them (stripGraph.ts), the
	 * lanes from the song's start, and every MIDI clip through its
	 * instrument's voices on the offline context (midiRender.ts), so no
	 * real-time pass is needed. `track` renders one track alone with its
	 * own settings (a stem); `bus` one bus with what feeds it (the tracks
	 * routed there and the sends into it); either without the master's
	 * inserts and fader. A second of tail lets reverbs and delays ring out.
	 */
	async render(target: RenderTarget = {}): Promise<AudioBuffer> {
		await this.ensureReferenced();
		await this.ensureWarped();
		const trackId = target.track ?? null;
		const busId = target.bus ?? null;
		const alone = Boolean(trackId || busId);
		// The song's rate, not the device's: the offline context resamples the sources decoded at the device's.
		const sampleRate = songSampleRate(this.arrangement);
		const length = Math.max(1, Math.ceil((this.duration + RENDER_TAIL_S) * sampleRate));
		const off = new OfflineAudioContext(2, length, sampleRate);
		const master = createStripGraph(off, {
			inserts: alone ? [] : this.#synced(this.arrangement.masterInserts ?? [], 0),
			pan: 0,
		});
		master.fader.gain.value = alone ? 1 : this.#masterGain();
		master.route(off.destination);
		if (!alone) this.#scheduleLanes(this.#masterOwner(), master, 0, 0, null);
		const buses = this.arrangement.buses ?? [];
		// A bus alone sums what routes into it, the buses under it included (docs/multitrack-recorder.md "Folder tracks").
		const within = busId ? busDescendants(buses, busId) : null;
		const busInputs = new Map<string, AudioNode>();
		const busStrips: [StudioBus, ReturnType<typeof createStripGraph>][] = [];
		for (const b of buses) {
			if (trackId || (within && !within.has(b.id))) continue;
			const strip = createStripGraph(off, { inserts: this.#synced(insertsOf(b), 0), pan: b.pan });
			strip.fader.gain.value = b.id === busId ? b.gain : this.#busGain(b);
			busInputs.set(b.id, strip.input);
			busStrips.push([b, strip]);
			this.#scheduleLanes(b, strip, 0, 0, null);
		}
		// Each bus to its output bus (never into a loop) or the master; the bus rendered alone to the master.
		for (const [b, strip] of busStrips) {
			const to =
				b.id !== busId && b.output && !busDescendants(buses, b.id).has(b.output)
					? busInputs.get(b.output)
					: undefined;
			strip.route(to ?? master.input);
		}
		const nodes = new Map<string, GainNode>();
		for (const t of this.arrangement.tracks) {
			if (trackId && t.id !== trackId) continue;
			if (
				within &&
				!(t.output && within.has(t.output)) &&
				!t.sends?.some((x) => x.bus === busId && x.level > 0)
			)
				continue;
			const g = trackId ? (target.freeze ? 1 : t.gain) : this.#effectiveGain(t);
			if (g <= 0) continue;
			const strip = createStripGraph(off, {
				inserts: this.#synced(insertsOf(t), 0),
				pan: trackId && target.freeze ? 0 : t.pan,
				mono: !!t.mono,
			});
			strip.fader.gain.value = trackId && t.automation?.volume?.length && !target.freeze ? 1 : g;
			// A bus alone: a track reaches it by its output (through a bus under it, maybe), or by its send alone (its output then goes nowhere).
			if (within) strip.route((t.output && busInputs.get(t.output)) || off.createGain());
			else strip.route((t.output && busInputs.get(t.output)) || master.input);
			if (!trackId) strip.setSends(t.sends ?? [], busInputs, 0);
			// A freeze bakes the inserts' lanes and leaves the volume and pan (and the sends) to the live strip.
			const lanes = target.freeze
				? {
						automation: Object.fromEntries(
							Object.entries(t.automation ?? {}).filter(([k]) => k.startsWith("insert:")),
						),
						inserts: insertsOf(t),
					}
				: t;
			this.#scheduleLanes(lanes, strip, 0, 0, null);
			nodes.set(t.id, strip.input);
		}
		// The MIDI tracks' clips, through their instruments offline; the kits and chains build first, the rendering starts after.
		const midi: Promise<void>[] = [];
		for (const t of this.arrangement.tracks) {
			const into = nodes.get(t.id);
			if (!into || t.kind !== "midi" || !t.input || !isInstrument(t.input.source)) continue;
			const clips = this.arrangement.clips.filter(
				(c) => c.trackId === t.id && c.notes?.length && !c.muted,
			);
			if (clips.length)
				midi.push(
					renderMidiClipsOffline(off, into, t, clips, this.arrangement.bpm, {
						grid: this.grid,
						swing: t.swing,
						humanize: t.humanize,
					}),
				);
		}
		const fades = clipCrossfades(this.arrangement.clips);
		for (const clip of this.arrangement.clips) {
			if (!clip.sourceId || clip.muted) continue; // a MIDI clip: its notes play through the instrument above; a switched-off clip plays nothing
			const buffer = this.clipBufferOf(clip);
			const into = nodes.get(clip.trackId);
			if (!buffer || !into) continue;
			const f = fades.get(clip.id) ?? fadesOf(clip);
			const clipEnd = clip.start + clip.duration;
			for (const seg of clipSegments(clip)) {
				const src = off.createBufferSource();
				src.buffer = buffer;
				const gain = off.createGain();
				const len = Math.min(seg.duration, Math.max(0, buffer.duration - seg.offset));
				if (len <= 0) continue;
				const env = envelopeNode(off, clip.gainEnvelope, seg.start, seg.offset, len);
				if (env) src.connect(env).connect(gain).connect(into);
				else src.connect(gain).connect(into);
				scheduleFades(gain.gain, clip.gain, seg.start, len, {
					...f,
					fadeIn: seg.start === clip.start ? Math.max(EDGE_FADE, f.fadeIn) : EDGE_FADE,
					fadeOut: seg.start + seg.duration >= clipEnd ? Math.max(EDGE_FADE, f.fadeOut) : EDGE_FADE,
				});
				src.start(seg.start, seg.offset, len);
			}
		}
		await Promise.all(midi);
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
			monoTracks: Array.from(this.#tracks.entries())
				.filter(([, s]) => s.mono)
				.map(([id]) => id),
			playing: this.#playing.length,
			clipsQueued: this.#clipQueue.length,
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
		this.#graph?.dispose();
		this.#graph = null;
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
