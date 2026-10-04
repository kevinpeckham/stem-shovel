import { audioSession } from "$lib/utils/audioSession";
import { inputSources, outputLatencyMs, type InputSource } from "./inputs.svelte";
import { encodeWav24 } from "$lib/utils/encodeWav24";
import { tapTempo } from "$lib/utils/tapTempo";
import { drumMachine } from "./drumMachine.svelte";
import { loadStoredLoop, saveStoredLoop, type StoredLoop } from "./loopStore";
import { metronome } from "./metronome.svelte";
import { claimPlayback, releasePlayback } from "./onlyOnePlays";
import { computePeaks } from "./peaks";
import { chordPiano, piano } from "./piano.svelte";
import { playThroughSilentSwitch } from "./playThroughSilentSwitch";

/**
 * The looper (docs/looper.md): a loop of `bars` at `bpm` that plays round
 * and round while layers are recorded onto it one pass at a time from the
 * microphone, the piano or the drum machine. One AudioContext hosts the
 * instruments (their graphs are built in it, so their sound reaches the
 * capture sample-accurately); the microphone comes in from outside and is
 * shifted earlier by the measured latency. Capture is an AudioWorklet
 * (static/worklets/loop-capture.js) that copies the armed source from the
 * loop's next bar 1 for exactly one loop length per pass; each pass
 * becomes a layer, an AudioBuffer looped by its own source node, all
 * started on one clock so they stay locked. Saving renders the layers'
 * mix offline and hands the mix and the layers to the recorder's queue
 * as a take with sources (docs/demo-recording.md, "Multitrack takes").
 */

export type LoopSource = "mic" | "line" | "computer" | "piano" | "chords" | "drums";
export const LOOP_SOURCES: LoopSource[] = ["mic", "line", "computer", "piano", "chords", "drums"];
export const LOOP_SOURCE_LABELS: Record<LoopSource, string> = {
	mic: "Microphone",
	line: "Line in",
	computer: "Computer",
	piano: "Piano",
	chords: "Chords",
	drums: "Drums",
};
/** The sources that come in through an audio input device (docs/looper.md, "Inputs"): the microphone and a second input, an instrument on an interface say. */
export type { ChannelMode, InputSource } from "./inputs.svelte";
export const LOOP_BARS = [1, 2, 4, 8] as const;
export type LoopBars = (typeof LOOP_BARS)[number];
export const MAX_LOOP_LAYERS = 16;
/** Samples kept before bar 1 on every pass, so a late microphone can be shifted up to this much earlier. */
export const LEAD_SECONDS = 0.3;

export interface LoopLayer {
	id: string;
	label: string;
	source: LoopSource;
	buffer: AudioBuffer;
	/** 0 to 1. */
	gain: number;
	muted: boolean;
	solo: boolean;
	peaks: Float32Array;
}

type Phase = "idle" | "counting" | "playing" | "recording";

class LooperEngine {
	bpm = $state(100);
	beatsPerBar = $state<3 | 4>(4);
	bars = $state<LoopBars>(2);
	/** A bar of clicks before the first pass. */
	countIn = $state(true);
	/** The click: on the count-in only, through the loop, or never. */
	click = $state<"count-in" | "always" | "off">("count-in");
	phase = $state<Phase>("idle");
	/** Passes captured since Record, for the display. */
	passes = $state(0);
	layers = $state<LoopLayer[]>([]);
	/** The source Record captures. */
	armed = $state<LoopSource>("mic");
	/** Hear the microphone through the speakers (off: feedback on a laptop). */
	/** The microphone's lateness, compensated on its layers; the context's own figure until measured. */
	/**
	 * The audio device's output latency as the browser reports it (base plus
	 * output latency, 10–30 ms on a built-in output, 150 ms and more over
	 * Bluetooth). A layer played by hand on the piano is timed against the
	 * loop as heard, that much late, so piano layers are shifted earlier by
	 * it; the drum machine's beat runs on the clock and needs none. The
	 * software path from a key press to the note in the graph measured
	 * under a millisecond (docs/looper.md, "Verified").
	 */
	outputLatencyMs = $state(0);
	/** Shift piano layers earlier by the output latency (off: as played into the graph). */
	compensatePiano = $state(true);
	volume = $state(1);
	/** Where the loop is, for the display: 1-based bar and beat, and the fraction of the loop gone by; counting in, `bar` is 0. */
	position = $state({ bar: 0, beat: 0, fraction: 0 });
	/** Each source's level for its meter, 0 to 1. */
	levels = $state<Record<LoopSource, number>>({
		mic: 0,
		line: 0,
		computer: 0,
		piano: 0,
		chords: 0,
		drums: 0,
	});
	/** The context and the capture are open (a gesture did it). */
	ready = $state(false);
	/** How far ahead of the main thread's clock a start is scheduled: enough for the scheduling to land in the render thread's future. */
	startAhead = 0.1;
	notice = $state<string | null>(null);

	#ctx: AudioContext | null = null;
	#master: GainNode | null = null;
	#tapIn: GainNode | null = null;
	#worklet: AudioWorkletNode | null = null;
	#sourceGains: Partial<Record<LoopSource, GainNode>> = {};
	#analysers: Partial<Record<LoopSource, AnalyserNode>> = {};
	#analyserBuf: Float32Array<ArrayBuffer> | null = null;
	/** The node each outside source comes in through, replaced when its device changes. */
	#inputNodes: Partial<Record<LoopSource, AudioNode>> = {};
	#playing: { layerId: string; src: AudioBufferSourceNode; gain: GainNode }[] = [];
	/** Bar 1 of the first pass on the context's clock. */
	#loopStart = 0;
	#frame = 0;
	#meterFrame = 0;
	#recordingSource: LoopSource | null = null;
	#startedDrums = false;
	#metronomeStopTimer: ReturnType<typeof setTimeout> | null = null;
	#passHandler: ((m: MessageEvent) => void) | null = null;

	get barSeconds() {
		return (this.beatsPerBar * 60) / this.bpm;
	}
	get loopSeconds() {
		return this.bars * this.barSeconds;
	}
	/** Tempo and length lock once a layer exists (a change would not fit the layers). */
	get locked() {
		return this.layers.length > 0;
	}
	#loopFrames() {
		return Math.round(this.loopSeconds * this.#ctx!.sampleRate);
	}

	/** Opens the context and the capture, hosts the instruments; from a gesture. A second call while the first is still loading the worklet waits for it (the page opens on any pointer-down, a button's click a moment later). */
	#opening: Promise<void> | null = null;
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
	async #openNow(): Promise<void> {
		playThroughSilentSwitch();
		const session = audioSession();
		if (session) session.type = "play-and-record";
		const ctx = new AudioContext({ latencyHint: "interactive" });
		this.#ctx = ctx;
		// Hosted before anything awaits, so an instrument played in the meantime builds its graph here and not in a context of its own.
		piano.hostContext(ctx);
		chordPiano.hostContext(ctx);
		drumMachine.hostContext(ctx);
		metronome.hostContext(ctx);
		await ctx.audioWorklet.addModule("/worklets/loop-capture.js");
		if (ctx.state !== "running") await ctx.resume().catch(() => {});
		const master = ctx.createGain();
		master.gain.value = this.volume;
		master.connect(ctx.destination);
		this.#master = master;
		const tapIn = ctx.createGain();
		this.#tapIn = tapIn;
		// One (silent) output into the destination through a muted gain: a node nothing pulls is not rendered in every browser (Safari), and the capture must run.
		const worklet = new AudioWorkletNode(ctx, "loop-capture", {
			numberOfInputs: 1,
			numberOfOutputs: 1,
			outputChannelCount: [1],
			channelCount: 2,
			channelCountMode: "explicit",
		});
		tapIn.connect(worklet);
		const sink = ctx.createGain();
		sink.gain.value = 0;
		worklet.connect(sink);
		sink.connect(ctx.destination);
		this.#worklet = worklet;
		worklet.port.onmessage = (e) => this.#passHandler?.(e);
		// The instruments' outputs reach the speakers as always and the capture through a gain per source (only the armed one open).
		this.#tapSource("piano", piano.output());
		// The chord player has its own engine (docs/chord-player.md, "Its own engine"): its own output and gain, so a piano layer and a chords layer are separate sounds.
		this.#tapSource("chords", chordPiano.output());
		this.#tapSource("drums", drumMachine.output());
		// The kit for this context, ahead of the first drums layer (its start must land on bar 1, not after a decode).
		void drumMachine.readyKit();
		this.#analyserBuf = new Float32Array(1024);
		cancelAnimationFrame(this.#meterFrame);
		this.#meter();
		this.#attachInputs();
		this.outputLatencyMs = outputLatencyMs(ctx);
		this.ready = true;
		await this.#restore();
	}
	/**
	 * The loop kept in the browser (loopStore.ts): written a moment after a
	 * layer or a setting changes, read back when the looper opens, so a
	 * reload or a sign-in keeps the loop; a visitor without an account has
	 * this and nothing else. The stored audio is the layers' own samples.
	 */
	#persistTimer: ReturnType<typeof setTimeout> | null = null;
	/** `changed`: the layers or the settings differ from the saved loop (false for a save, a load or a title edit). */
	#persist(changed = true) {
		if (changed && this.layers.length > 0) this.dirty = true;
		if (this.#persistTimer) clearTimeout(this.#persistTimer);
		this.#persistTimer = setTimeout(() => {
			this.#persistTimer = null;
			const loop: StoredLoop = {
				bpm: this.bpm,
				beatsPerBar: this.beatsPerBar,
				bars: this.bars,
				savedAt: Date.now(),
				saved: {
					ideaId: this.savedId,
					recordingId: this.savedRecordingId,
					title: this.title,
					inRecorder: this.inRecorder,
					dirty: this.dirty,
				},
				layers: this.layers.map((l) => ({
					id: l.id,
					label: l.label,
					source: l.source,
					gain: l.gain,
					muted: l.muted,
					solo: l.solo,
					sampleRate: l.buffer.sampleRate,
					channels: [l.buffer.getChannelData(0).slice(), l.buffer.getChannelData(1).slice()],
				})),
			};
			void saveStoredLoop(loop);
		}, 400);
	}
	async #restore() {
		if (this.layers.length > 0) return;
		const stored = await loadStoredLoop();
		const ctx = this.#ctx;
		if (!stored || !ctx || this.layers.length > 0 || this.phase !== "idle") return;
		this.bpm = stored.bpm;
		this.beatsPerBar = stored.beatsPerBar;
		this.bars = stored.bars;
		this.syncTempo();
		for (const l of stored.layers) {
			if (l.channels.length < 2 || !l.channels[0].length) continue;
			const buffer = ctx.createBuffer(2, l.channels[0].length, l.sampleRate);
			buffer.getChannelData(0).set(l.channels[0]);
			buffer.getChannelData(1).set(l.channels[1]);
			this.layers.push({
				id: l.id,
				label: l.label,
				source: l.source,
				buffer,
				gain: l.gain,
				muted: l.muted,
				solo: l.solo,
				peaks: computePeaks(buffer, 512),
			});
		}
		this.restored = this.layers.length;
		if (stored.saved) {
			this.savedId = stored.saved.ideaId;
			this.savedRecordingId = stored.saved.recordingId;
			this.title = stored.saved.title;
			this.inRecorder = stored.saved.inRecorder;
			this.dirty = stored.saved.dirty;
		}
	}
	/** How many layers came back from the browser's store on opening, for a notice. */
	restored = $state(0);
	/**
	 * The saved loop this is (docs/looper.md, "Save and Export"): its idea
	 * and take on the server once saved, its title, whether it has been
	 * exported into the recorder's list, and whether the layers or the
	 * settings changed since the save. Kept in the browser's store with the
	 * loop, so a reload knows which loop it is.
	 */
	savedId = $state<string | null>(null);
	savedRecordingId = $state<string | null>(null);
	title = $state("");
	inRecorder = $state(false);
	dirty = $state(false);
	/** The page's record of a save or a load: what the loop now is on the server. */
	markSaved(meta: { ideaId: string; recordingId: string; title: string; inRecorder: boolean }) {
		this.savedId = meta.ideaId;
		this.savedRecordingId = meta.recordingId;
		this.title = meta.title;
		this.inRecorder = meta.inRecorder;
		this.dirty = false;
		this.#persist(false);
	}
	/** A new loop from here on: the next save makes its own idea. */
	detach() {
		this.savedId = null;
		this.savedRecordingId = null;
		this.inRecorder = false;
		this.dirty = this.layers.length > 0;
		this.#persist(false);
	}
	setTitle(title: string) {
		this.title = title.trim().slice(0, 120);
		this.#persist(false);
	}
	/**
	 * A take from the Idea Recorder as layers (docs/looper.md, "Importing a
	 * take"): its sources one layer each when it is a multitrack take, else
	 * the take itself as one layer. With `lengthFrom` "take" (an empty loop)
	 * the bars follow the take's length at the tempo, rounded to the nearest
	 * allowed; with "loop" the current length holds. Each file is cut to the
	 * loop length from `startSeconds` in, padded with silence when shorter.
	 * Returns how many layers landed.
	 */
	async importTake(
		mix: { url: string; title: string; durationSeconds: number | null },
		sources: { label: string; url: string; sortOrder: number }[],
		opts: { lengthFrom: "loop" | "take"; startSeconds: number },
	): Promise<number> {
		await this.open();
		const ctx = this.#ctx!;
		if (this.phase !== "idle") this.stop();
		this.loading = true;
		try {
			const files =
				sources.length > 0
					? [...sources].sort((a, b) => a.sortOrder - b.sortOrder)
					: [{ label: mix.title, url: mix.url, sortOrder: 0 }];
			const decoded: { label: string; audio: AudioBuffer }[] = [];
			for (const f of files) {
				const res = await fetch(f.url);
				if (!res.ok) throw new Error(`Could not fetch ${f.label} (${res.status})`);
				decoded.push({ label: f.label, audio: await ctx.decodeAudioData(await res.arrayBuffer()) });
			}
			if (opts.lengthFrom === "take" && !this.locked) {
				const seconds = Math.max(0, (decoded[0]?.audio.duration ?? 0) - opts.startSeconds);
				const bars = seconds / this.barSeconds;
				const nearest = [...LOOP_BARS].reduce((best, n) =>
					Math.abs(n - bars) < Math.abs(best - bars) ? n : best,
				);
				this.bars = nearest;
				this.#persist();
			}
			const start = Math.max(0, opts.startSeconds);
			for (const [k, d] of decoded.entries()) {
				const sr = d.audio.sampleRate;
				const frames = Math.round(this.loopSeconds * sr);
				const from = Math.round(start * sr);
				const buffer = ctx.createBuffer(2, frames, sr);
				for (let c = 0; c < 2; c++) {
					const src = d.audio.getChannelData(Math.min(c, d.audio.numberOfChannels - 1));
					const n = Math.max(0, Math.min(frames, src.length - from));
					if (n > 0) buffer.getChannelData(c).set(src.subarray(from, from + n));
				}
				const label = d.label;
				const source: LoopSource = label.startsWith("Piano")
					? "piano"
					: label.startsWith("Chords")
						? "chords"
						: label.startsWith("Drums")
							? "drums"
							: "mic";
				if (this.layers.length >= MAX_LOOP_LAYERS) break;
				const layer: LoopLayer = {
					id: `${Date.now().toString(36)}i${k}`,
					label,
					source,
					buffer,
					gain: 1,
					muted: false,
					solo: false,
					peaks: computePeaks(buffer, 512),
				};
				this.layers.push(layer);
			}
			this.restored = 0;
			this.#persist();
			return decoded.length;
		} finally {
			this.loading = false;
		}
	}
	/** A loop being fetched and decoded from its exported sources. */
	loading = $state(false);
	/**
	 * A loop exported to the Idea Recorder, back from its take's sources
	 * (docs/looper.md, "Export and Load"): the current layers go, the tempo
	 * and length follow the settings, each source is fetched and decoded in
	 * this context and becomes a layer with its label and, by position, its
	 * level and mute from the settings. Returns how many layers landed.
	 */
	async loadFrom(
		sources: { label: string; url: string; sortOrder: number }[],
		settings: {
			bpm: number;
			beatsPerBar: 3 | 4;
			bars: LoopBars;
			layers: { label: string; source: LoopSource; gain: number; muted: boolean }[];
		} | null,
		meta: { ideaId: string; recordingId: string; title: string; inRecorder: boolean } | null = null,
	): Promise<number> {
		await this.open();
		const ctx = this.#ctx!;
		this.stop();
		this.loading = true;
		try {
			this.clear();
			if (settings) {
				this.bpm = settings.bpm;
				this.beatsPerBar = settings.beatsPerBar;
				this.bars = settings.bars;
				this.syncTempo();
			}
			const ordered = [...sources].sort((a, b) => a.sortOrder - b.sortOrder);
			for (const [k, src] of ordered.entries()) {
				const res = await fetch(src.url);
				if (!res.ok) throw new Error(`Could not fetch ${src.label} (${res.status})`);
				const decoded = await ctx.decodeAudioData(await res.arrayBuffer());
				const buffer = ctx.createBuffer(2, decoded.length, decoded.sampleRate);
				buffer.getChannelData(0).set(decoded.getChannelData(0));
				buffer.getChannelData(1).set(decoded.getChannelData(decoded.numberOfChannels > 1 ? 1 : 0));
				const meta = settings?.layers[k];
				const source: LoopSource =
					meta?.source ??
					(src.label.startsWith("Piano")
						? "piano"
						: src.label.startsWith("Chords")
							? "chords"
							: src.label.startsWith("Drums")
								? "drums"
								: "mic");
				this.layers.push({
					id: `${Date.now().toString(36)}${k}`,
					label: src.label,
					source,
					buffer,
					gain: meta?.gain ?? 1,
					muted: meta?.muted ?? false,
					solo: false,
					peaks: computePeaks(buffer, 512),
				});
			}
			this.restored = 0;
			if (meta) this.markSaved(meta);
			else this.#persist();
			return this.layers.length;
		} finally {
			this.loading = false;
		}
	}
	#tapSource(source: LoopSource, node: AudioNode) {
		const ctx = this.#ctx!;
		// A source opened again (another device, another share) replaces its earlier tap.
		this.#sourceGains[source]?.disconnect();
		this.#analysers[source]?.disconnect();
		this.#inputNodes[source]?.disconnect();
		this.#inputNodes[source] = node;
		const gain = ctx.createGain();
		gain.gain.value = this.armed === source ? 1 : 0;
		node.connect(gain);
		gain.connect(this.#tapIn!);
		const analyser = ctx.createAnalyser();
		analyser.fftSize = 1024;
		node.connect(analyser);
		this.#sourceGains[source] = gain;
		this.#analysers[source] = analyser;
	}

	/** The microphone, with the voice processors off; from a gesture. */
	async requestMic(): Promise<boolean> {
		return this.requestInput("mic");
	}
	/** The shared sources (inputs.svelte.ts) wired into this context: each open one is tapped here, and a change of device or channels re-taps it. */
	#attachInputs() {
		inputSources.attach(this.#ctx!, {
			monitorOut: this.#master!,
			captureModuleLoaded: true,
			onsource: (source, node) => {
				if (node) this.#tapSource(source, node);
				else this.#untap(source);
			},
		});
	}
	#untap(source: LoopSource) {
		this.#sourceGains[source]?.disconnect();
		this.#analysers[source]?.disconnect();
		this.#inputNodes[source]?.disconnect();
		delete this.#sourceGains[source];
		delete this.#analysers[source];
		delete this.#inputNodes[source];
		this.levels[source] = 0;
	}
	/** The microphone or the line in (inputs.svelte.ts), opened into this looper; from a gesture. */
	async requestInput(source: InputSource, deviceId?: string | null): Promise<boolean> {
		await this.open();
		return inputSources.requestInput(source, deviceId);
	}
	/** Audio from another program through the browser's share picker (inputs.svelte.ts); from a gesture. */
	async requestComputer(): Promise<boolean> {
		await this.open();
		return inputSources.requestComputer();
	}
	get hasMic() {
		return inputSources.has("mic");
	}
	hasSource(source: LoopSource) {
		return (
			source === "piano" || source === "chords" || source === "drums" || inputSources.has(source)
		);
	}

	setArmed(source: LoopSource) {
		this.armed = source;
		if (this.phase !== "recording") this.#openTap(source);
	}
	#openTap(source: LoopSource | null) {
		const t = this.#ctx?.currentTime ?? 0;
		for (const s of LOOP_SOURCES)
			this.#sourceGains[s]?.gain.setTargetAtTime(s === source ? 1 : 0, t, 0.005);
	}
	setVolume(v: number) {
		this.volume = Math.max(0, Math.min(1, v));
		this.#master?.gain.setTargetAtTime(this.volume, this.#ctx?.currentTime ?? 0, 0.02);
	}
	/** Tempo and length: only while no layer exists (the page clears the loop first if the user insists). The tempo is the session's (the metronome's), which the drums and the chord player follow; the page brings a change there back here. */
	setBpm(v: number) {
		if (this.locked) return;
		this.bpm = Math.max(40, Math.min(240, Math.round(v)));
		this.syncTempo();
		this.#persist();
	}
	/** The session tempo at the loop's (also what holds it there while the loop has layers); a drum machine not following is set too. */
	syncTempo() {
		if (metronome.bpm !== this.bpm) metronome.setBpm(this.bpm);
		if (!drumMachine.followTempo && drumMachine.project.bpm !== this.bpm) {
			drumMachine.load();
			drumMachine.setBpm(this.bpm);
		}
	}
	/** Tap the tempo (the metronome's way, the last eight taps); while the loop has layers the tempo is fixed. */
	#taps: number[] = [];
	tap() {
		if (this.locked) return;
		this.#taps = [...this.#taps, performance.now()].slice(-8);
		const bpm = tapTempo(this.#taps);
		if (bpm) this.setBpm(bpm);
	}
	setBars(n: LoopBars) {
		if (this.locked) return;
		this.bars = n;
		this.#persist();
	}
	setBeatsPerBar(n: 3 | 4) {
		if (this.locked) return;
		this.beatsPerBar = n;
		this.#persist();
	}

	/** Play the loop (and count in first when asked); an empty loop runs its transport so the first layer can be recorded against the click. */
	async play(ahead = this.startAhead): Promise<void> {
		if (this.phase !== "idle") return;
		await this.open();
		const ctx = this.#ctx!;
		claimPlayback(this);
		const now = ctx.currentTime + ahead;
		const countIn = this.countIn ? this.barSeconds : 0;
		this.#loopStart = now + countIn;
		for (const layer of this.layers) this.#startLayer(layer, this.#loopStart, 0);
		if (this.click !== "off" && (this.countIn || this.click === "always")) {
			metronome.setBpm(this.bpm);
			metronome.setBeats(this.beatsPerBar);
			void metronome.startAt(this.countIn ? now : this.#loopStart);
			if (this.click === "count-in") {
				this.#metronomeStopTimer = setTimeout(() => metronome.stop(), countIn * 1000 + 50);
			}
		}
		this.phase = this.countIn ? "counting" : "playing";
		this.#follow();
	}
	#startLayer(layer: LoopLayer, when: number, offset: number) {
		const ctx = this.#ctx!;
		const src = ctx.createBufferSource();
		src.buffer = layer.buffer;
		src.loop = true;
		const gain = ctx.createGain();
		gain.gain.value = this.#effectiveGain(layer);
		src.connect(gain);
		gain.connect(this.#master!);
		src.start(when, offset);
		this.#playing.push({ layerId: layer.id, src, gain });
	}
	#effectiveGain(layer: LoopLayer) {
		const anySolo = this.layers.some((l) => l.solo);
		return layer.muted || (anySolo && !layer.solo) ? 0 : layer.gain;
	}
	#applyGains() {
		const t = this.#ctx?.currentTime ?? 0;
		for (const p of this.#playing) {
			const layer = this.layers.find((l) => l.id === p.layerId);
			if (layer) p.gain.gain.setTargetAtTime(this.#effectiveGain(layer), t, 0.01);
		}
	}
	/** Seconds until the pass under way completes (and, recording, its layer lands), for the display. */
	get secondsToPassEnd() {
		if (this.phase === "idle" || !this.#ctx) return 0;
		const t = this.#ctx.currentTime - this.#loopStart;
		if (t < 0) return -t + this.loopSeconds;
		return this.loopSeconds - (t % this.loopSeconds);
	}
	/** The loop's phase now: seconds into the current pass. */
	#phaseNow() {
		const t = this.#ctx!.currentTime - this.#loopStart;
		return t < 0 ? 0 : t % this.loopSeconds;
	}
	/** The next bar 1 on the clock, at least `minAhead` seconds away. */
	#nextBoundary(minAhead = 0.05) {
		const ctx = this.#ctx!;
		if (ctx.currentTime + minAhead <= this.#loopStart) return this.#loopStart;
		const passes = Math.ceil((ctx.currentTime + minAhead - this.#loopStart) / this.loopSeconds);
		return this.#loopStart + passes * this.loopSeconds;
	}

	stop() {
		if (this.phase === "idle") return;
		if (this.phase === "recording") this.#cutRecording();
		for (const p of this.#playing) {
			try {
				p.src.stop();
			} catch {
				// Already stopped.
			}
		}
		this.#playing = [];
		if (this.#metronomeStopTimer) clearTimeout(this.#metronomeStopTimer);
		this.#metronomeStopTimer = null;
		metronome.stop();
		if (this.#startedDrums) {
			drumMachine.stop();
			this.#startedDrums = false;
		}
		cancelAnimationFrame(this.#frame);
		this.phase = "idle";
		this.position = { bar: 0, beat: 0, fraction: 0 };
		releasePlayback(this);
	}
	toggle() {
		if (this.phase === "idle") void this.play();
		else this.stop();
	}

	/**
	 * Record a layer from the armed source, from the next bar 1 (after the
	 * count-in when the loop is not playing yet), pass after pass until
	 * `finishRecording`; each full pass becomes a layer. The drum machine,
	 * when it is the source, (re)starts on that bar 1 at the loop's tempo.
	 */
	async record(): Promise<void> {
		if (this.phase === "recording") return;
		if (this.layers.length >= MAX_LOOP_LAYERS) {
			this.notice = `A loop holds at most ${MAX_LOOP_LAYERS} layers.`;
			return;
		}
		if (
			(this.armed === "mic" || this.armed === "line") &&
			!inputSources.has(this.armed) &&
			!(await this.requestInput(this.armed))
		)
			return;
		if (
			this.armed === "computer" &&
			!inputSources.has("computer") &&
			!(await this.requestComputer())
		)
			return;
		const source = this.armed;
		// The drums must be ready to start on the bar: the kit decoded before the bar is chosen.
		if (source === "drums") await drumMachine.readyKit();
		// From a standstill the capture's lead-in must fit before bar 1 (the count-in gives it; without one, the start waits for it).
		if (this.phase === "idle")
			await this.play(
				this.countIn ? this.startAhead : Math.max(this.startAhead, LEAD_SECONDS + 0.05),
			);
		const ctx = this.#ctx!;
		const from = this.#nextBoundary(0.08);
		this.#recordingSource = source;
		this.#openTap(source);
		if (source === "drums") {
			// The beat starts on bar 1 (after the count-in from a standstill), whatever it was doing: a beat auditioned from the panel is restarted in step with the loop (Kevin).
			drumMachine.load();
			if (drumMachine.running) drumMachine.stop();
			if (!drumMachine.followTempo) drumMachine.setBpm(this.bpm);
			void drumMachine.startAt(from);
			this.#startedDrums = true;
		}
		const lead = Math.round(LEAD_SECONDS * ctx.sampleRate);
		this.passes = 0;
		this.#passHandler = (e) => this.#onCapture(e.data);
		this.#worklet!.port.postMessage({
			type: "arm",
			length: this.#loopFrames(),
			lead,
			startFrame: Math.round(from * ctx.sampleRate),
			passes: Infinity,
		});
		this.finishing = false;
		this.phase = "recording";
	}
	/** Let the pass under way complete, then stop capturing. */
	finishRecording() {
		if (this.phase !== "recording" || this.finishing) return;
		this.finishing = true;
		this.#worklet!.port.postMessage({ type: "finish" });
	}
	/** Record pressed again while recording: the pass under way completes and no other starts (the screen says so). */
	finishing = $state(false);
	/** Record: start a layer, or while recording let the pass under way be the last (a loop pedal's second press). */
	async toggleRecord(): Promise<void> {
		if (this.phase === "recording") this.finishRecording();
		else await this.record();
	}
	/** Drop the pass under way at once. */
	#cutRecording() {
		this.#passHandler = null;
		this.#worklet?.port.postMessage({ type: "cut" });
		this.#recordingSource = null;
		this.finishing = false;
		if (this.phase === "recording") this.phase = "playing";
	}
	cancelRecording() {
		this.#cutRecording();
	}
	#onCapture(m: { type: string; index?: number; channels?: Float32Array[]; lead?: number }) {
		if (m.type === "done") {
			this.#recordingSource = null;
			this.#passHandler = null;
			this.finishing = false;
			if (this.phase === "recording") this.phase = "playing";
			return;
		}
		if (m.type !== "pass" || !m.channels || this.#recordingSource === null) return;
		const ctx = this.#ctx!;
		const frames = this.#loopFrames();
		const source = this.#recordingSource;
		// A late microphone is shifted earlier by the measured round trip, out of the lead-in; a piano played by hand against the loop as heard, by the output latency; the drum machine's beat runs on the clock and needs none.
		const shiftMs =
			source === "mic" || source === "line"
				? inputSources.latencyMs
				: source === "computer"
					? inputSources.computerLatencyMs
					: (source === "piano" || source === "chords") && this.compensatePiano
						? this.outputLatencyMs
						: 0;
		// Earlier means later in the pass buffer: bar 1 is at index `lead`, and the pass holds a tail of `lead` frames past its end for this.
		const shift = Math.min(m.lead!, Math.round((shiftMs / 1000) * ctx.sampleRate));
		const offset = m.lead! + shift;
		const buffer = ctx.createBuffer(2, frames, ctx.sampleRate);
		for (let c = 0; c < 2; c++)
			buffer.getChannelData(c).set(m.channels[c].subarray(offset, offset + frames));
		// Normalize: a quiet pass from an outside source up to −1 dBFS (not a near-silent one, and never down).
		if (
			inputSources.normalize &&
			(source === "mic" || source === "line" || source === "computer")
		) {
			let peak = 0;
			for (let c = 0; c < 2; c++) {
				const x = buffer.getChannelData(c);
				for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
			}
			const target = 0.891; // −1 dBFS
			if (peak > 0.01 && peak < target) {
				const k = target / peak;
				for (let c = 0; c < 2; c++) {
					const x = buffer.getChannelData(c);
					for (let i = 0; i < x.length; i++) x[i] *= k;
				}
			}
		}
		const same = this.layers.filter((l) => l.source === source).length;
		const layer: LoopLayer = {
			id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
			label: same ? `${LOOP_SOURCE_LABELS[source]} ${same + 1}` : LOOP_SOURCE_LABELS[source],
			source,
			buffer,
			gain: 1,
			muted: false,
			solo: false,
			peaks: computePeaks(buffer, 512),
		};
		this.layers.push(layer);
		this.passes++;
		this.#persist();
		// The pass ended on a bar 1 a moment ago: the layer joins from where the loop is now.
		this.#startLayer(layer, ctx.currentTime, this.#phaseNow());
		if (this.layers.length >= MAX_LOOP_LAYERS) this.finishRecording();
	}

	undo() {
		const last = this.layers.at(-1);
		if (last) this.remove(last.id);
	}
	remove(id: string) {
		this.layers = this.layers.filter((l) => l.id !== id);
		for (const p of this.#playing.filter((x) => x.layerId === id)) {
			try {
				p.src.stop();
			} catch {
				// Already stopped.
			}
		}
		this.#playing = this.#playing.filter((x) => x.layerId !== id);
		this.#applyGains();
		this.#persist();
	}
	clear() {
		while (this.layers.length > 0) this.remove(this.layers[this.layers.length - 1].id);
	}
	setGain(id: string, gain: number) {
		const l = this.layers.find((x) => x.id === id);
		if (!l) return;
		l.gain = Math.max(0, Math.min(1, gain));
		this.#applyGains();
		this.#persist();
	}
	toggleMute(id: string) {
		const l = this.layers.find((x) => x.id === id);
		if (!l) return;
		l.muted = !l.muted;
		this.#applyGains();
		this.#persist();
	}
	toggleSolo(id: string) {
		const l = this.layers.find((x) => x.id === id);
		if (!l) return;
		l.solo = !l.solo;
		this.#applyGains();
		this.#persist();
	}
	rename(id: string, label: string) {
		const l = this.layers.find((x) => x.id === id);
		if (l) l.label = label.trim().slice(0, 60) || l.label;
	}

	#follow = () => {
		const ctx = this.#ctx;
		if (!ctx || this.phase === "idle") return;
		const t = ctx.currentTime;
		if (t < this.#loopStart) {
			const beat = Math.floor(
				((t - (this.#loopStart - this.barSeconds)) / this.barSeconds) * this.beatsPerBar,
			);
			this.position = { bar: 0, beat: Math.max(0, beat) + 1, fraction: 0 };
		} else {
			if (this.phase === "counting") this.phase = "playing";
			const fraction = ((t - this.#loopStart) % this.loopSeconds) / this.loopSeconds;
			const beats = Math.floor(fraction * this.bars * this.beatsPerBar);
			this.position = {
				bar: Math.floor(beats / this.beatsPerBar) + 1,
				beat: (beats % this.beatsPerBar) + 1,
				fraction,
			};
		}
		this.#frame = requestAnimationFrame(this.#follow);
	};

	/**
	 * The level meters, every frame from the moment the audio opens (not only
	 * while the loop runs): a source's level shows as soon as it is chosen,
	 * so an input can be checked before Record (Kevin: no level until Record
	 * was pressed). Each source's analyser reads its own node, ahead of the
	 * armed gain, so every opened source meters.
	 */
	#meter = () => {
		const buf = this.#analyserBuf;
		if (!this.#ctx || !buf) return;
		const next = { ...this.levels };
		let changed = false;
		for (const s of LOOP_SOURCES) {
			const a = this.#analysers[s];
			if (!a) continue;
			a.getFloatTimeDomainData(buf);
			let sum = 0;
			for (const x of buf) sum += x * x;
			const level = Math.min(1, Math.sqrt(sum / buf.length) * 3);
			if (level !== next[s]) {
				next[s] = level;
				changed = true;
			}
		}
		if (changed) this.levels = next;
		this.#meterFrame = requestAnimationFrame(this.#meter);
	};

	/** The layers' mix, `repeats` passes long, rendered offline with their levels (mute and solo applied). */
	async renderMix(repeats = 1): Promise<AudioBuffer> {
		const ctx = this.#ctx!;
		const frames = this.#loopFrames() * repeats;
		const off = new OfflineAudioContext(2, frames, ctx.sampleRate);
		for (const layer of this.layers) {
			const g = this.#effectiveGain(layer);
			if (g <= 0) continue;
			const src = off.createBufferSource();
			src.buffer = layer.buffer;
			src.loop = true;
			const gain = off.createGain();
			gain.gain.value = g;
			src.connect(gain).connect(off.destination);
			src.start(0);
			src.stop(frames / ctx.sampleRate);
		}
		return off.startRendering();
	}
	/** A layer, or any buffer, as a 24-bit WAV blob. */
	wavOf(buffer: AudioBuffer): Blob {
		const channels = [buffer.getChannelData(0), buffer.getChannelData(1)];
		return new Blob([encodeWav24(channels, buffer.sampleRate)], { type: "audio/wav" });
	}
	/** What the idea keeps of the loop beside the take (docs/looper.md). */
	settings() {
		return {
			bpm: this.bpm,
			beatsPerBar: this.beatsPerBar,
			bars: this.bars,
			layers: this.layers.map((l) => ({
				label: l.label,
				source: l.source,
				gain: l.gain,
				muted: l.muted,
			})),
		};
	}
	get sampleRate() {
		return this.#ctx?.sampleRate ?? 48000;
	}
	/** The clock, for a measurement: the context's time now and bar 1 of the first pass. */
	clock() {
		return { now: this.#ctx?.currentTime ?? 0, loopStart: this.#loopStart };
	}
	/**
	 * A diagnostic: an impulse scheduled `lead` + 0.5 s ahead, captured by
	 * the worklet from `lead` ahead; answers where it landed relative to
	 * where it should, in milliseconds (0 when scheduling and capture agree).
	 */
	async probeCapture(lead = 0.1): Promise<number | null> {
		const ctx = this.#ctx;
		if (!ctx || !this.#worklet || !this.#tapIn) return null;
		const from = ctx.currentTime + lead;
		const buf = ctx.createBuffer(1, 64, ctx.sampleRate);
		buf.getChannelData(0)[0] = 1;
		const src = ctx.createBufferSource();
		src.buffer = buf;
		src.connect(this.#tapIn);
		src.start(from + 0.5);
		const length = Math.round(ctx.sampleRate);
		const recorded = await new Promise<Float32Array | null>((resolve) => {
			const timer = setTimeout(() => resolve(null), 5000);
			this.#passHandler = (e) => {
				const m = e.data as { type: string; channels?: Float32Array[] };
				if (m.type === "pass" && m.channels) {
					clearTimeout(timer);
					resolve(m.channels[0]);
				}
			};
			this.#worklet!.port.postMessage({
				type: "arm",
				length,
				lead: 0,
				startFrame: Math.round(from * ctx.sampleRate),
				passes: 1,
			});
		});
		this.#passHandler = null;
		if (!recorded) return null;
		let at = -1;
		let peak = 0;
		for (let i = 0; i < recorded.length; i++)
			if (Math.abs(recorded[i]) > peak) {
				peak = Math.abs(recorded[i]);
				at = i;
			}
		return at < 0 ? null : (at / ctx.sampleRate - 0.5) * 1000;
	}
	/** The capture's clock against the main thread's, in milliseconds (positive: the render thread is ahead of what `currentTime` shows); a diagnostic. */
	probeClock(): Promise<number> {
		const ctx = this.#ctx;
		const worklet = this.#worklet;
		if (!ctx || !worklet) return Promise.resolve(0);
		return new Promise((resolve) => {
			const id = Math.random();
			const handler = (e: MessageEvent) => {
				const m = e.data as { type: string; frame?: number; id?: number };
				if (m.type !== "pong" || m.id !== id) return;
				worklet.port.removeEventListener("message", handler);
				resolve(((m.frame! - ctx.currentTime * ctx.sampleRate) / ctx.sampleRate) * 1000);
			};
			worklet.port.addEventListener("message", handler);
			worklet.port.postMessage({ type: "ping", id });
		});
	}
}

export const looper = new LooperEngine();
