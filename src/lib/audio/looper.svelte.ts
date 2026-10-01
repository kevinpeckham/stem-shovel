import { audioSession } from "$lib/utils/audioSession";
import { encodeWav24 } from "$lib/utils/encodeWav24";
import { findLatency } from "$lib/utils/findLatency";
import { drumMachine } from "./drumMachine.svelte";
import { metronome } from "./metronome.svelte";
import { claimPlayback, releasePlayback } from "./onlyOnePlays";
import { computePeaks } from "./peaks";
import { piano } from "./piano.svelte";
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

export type LoopSource = "mic" | "piano" | "drums";
export const LOOP_SOURCES: LoopSource[] = ["mic", "piano", "drums"];
export const LOOP_SOURCE_LABELS: Record<LoopSource, string> = {
	mic: "Microphone",
	piano: "Piano",
	drums: "Drums",
};
export const LOOP_BARS = [1, 2, 4, 8] as const;
export type LoopBars = (typeof LOOP_BARS)[number];
export const MAX_LOOP_LAYERS = 16;
/** Samples kept before bar 1 on every pass, so a late microphone can be shifted up to this much earlier. */
const LEAD_SECONDS = 0.3;
const LATENCY_KEY = "stemshovel.looper.latency-ms";

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
	monitorMic = $state(false);
	/** The microphone's lateness, compensated on its layers; the context's own figure until measured. */
	latencyMs = $state(0);
	latencyMeasured = $state(false);
	calibrating = $state(false);
	volume = $state(1);
	/** Where the loop is, for the display: 1-based bar and beat, and the fraction of the loop gone by; counting in, `bar` is 0. */
	position = $state({ bar: 0, beat: 0, fraction: 0 });
	/** Each source's level for its meter, 0 to 1. */
	levels = $state<Record<LoopSource, number>>({ mic: 0, piano: 0, drums: 0 });
	micLabel = $state<string | null>(null);
	micError = $state<string | null>(null);
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
	#micStream: MediaStream | null = null;
	#micMonitor: GainNode | null = null;
	#playing: { layerId: string; src: AudioBufferSourceNode; gain: GainNode }[] = [];
	/** Bar 1 of the first pass on the context's clock. */
	#loopStart = 0;
	#frame = 0;
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

	/** Opens the context and the capture, hosts the instruments; from a gesture. */
	async open(): Promise<void> {
		if (this.#ctx) {
			if (this.#ctx.state !== "running") await this.#ctx.resume().catch(() => {});
			return;
		}
		playThroughSilentSwitch();
		const session = audioSession();
		if (session) session.type = "play-and-record";
		const ctx = new AudioContext({ latencyHint: "interactive" });
		this.#ctx = ctx;
		// Hosted before anything awaits, so an instrument played in the meantime builds its graph here and not in a context of its own.
		piano.hostContext(ctx);
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
		const worklet = new AudioWorkletNode(ctx, "loop-capture", {
			numberOfInputs: 1,
			numberOfOutputs: 0,
			channelCount: 2,
			channelCountMode: "explicit",
		});
		tapIn.connect(worklet);
		this.#worklet = worklet;
		worklet.port.onmessage = (e) => this.#passHandler?.(e);
		// The instruments' outputs reach the speakers as always and the capture through a gain per source (only the armed one open).
		this.#tapSource("piano", piano.output());
		this.#tapSource("drums", drumMachine.output());
		// The kit for this context, ahead of the first drums layer (its start must land on bar 1, not after a decode).
		void drumMachine.readyKit();
		this.#analyserBuf = new Float32Array(1024);
		try {
			const stored = Number(localStorage.getItem(LATENCY_KEY));
			if (Number.isFinite(stored) && stored > 0) {
				this.latencyMs = stored;
				this.latencyMeasured = true;
			}
		} catch {
			// Private mode: measure again next time.
		}
		if (!this.latencyMeasured) {
			this.latencyMs = Math.round(
				(ctx.baseLatency +
					((ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 0)) *
					1000,
			);
		}
		this.ready = true;
	}
	#tapSource(source: LoopSource, node: AudioNode) {
		const ctx = this.#ctx!;
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
	async requestMic(inputId: string | null = null): Promise<boolean> {
		await this.open();
		const ctx = this.#ctx!;
		for (const t of this.#micStream?.getTracks() ?? []) t.stop();
		this.micError = null;
		try {
			this.#micStream = await navigator.mediaDevices.getUserMedia({
				audio: {
					echoCancellation: false,
					noiseSuppression: false,
					autoGainControl: false,
					sampleRate: { ideal: ctx.sampleRate },
					channelCount: { ideal: 2 },
					...(inputId ? { deviceId: { exact: inputId } } : {}),
				},
			});
		} catch (e) {
			const name = (e as { name?: string }).name;
			this.micError =
				name === "NotAllowedError"
					? "Microphone access was refused. Allow it for this site in your browser settings, then try again."
					: name === "NotFoundError"
						? "No microphone was found."
						: String(e);
			return false;
		}
		this.micLabel = this.#micStream.getAudioTracks()[0]?.label || null;
		const src = ctx.createMediaStreamSource(this.#micStream);
		this.#tapSource("mic", src);
		const monitor = ctx.createGain();
		monitor.gain.value = this.monitorMic ? 1 : 0;
		src.connect(monitor);
		monitor.connect(this.#master!);
		this.#micMonitor = monitor;
		return true;
	}
	get hasMic() {
		return !!this.#micStream;
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
	setMonitorMic(on: boolean) {
		this.monitorMic = on;
		this.#micMonitor?.gain.setTargetAtTime(on ? 1 : 0, this.#ctx?.currentTime ?? 0, 0.01);
	}
	setVolume(v: number) {
		this.volume = Math.max(0, Math.min(1, v));
		this.#master?.gain.setTargetAtTime(this.volume, this.#ctx?.currentTime ?? 0, 0.02);
	}
	setLatencyMs(ms: number) {
		this.latencyMs = Math.max(0, Math.min(500, Math.round(ms)));
		this.latencyMeasured = true;
		try {
			localStorage.setItem(LATENCY_KEY, String(this.latencyMs));
		} catch {
			// Private mode: the figure lasts for this page.
		}
	}
	/** Tempo and length: only while no layer exists (the page clears the loop first if the user insists). */
	setBpm(v: number) {
		if (this.locked) return;
		this.bpm = Math.max(40, Math.min(240, Math.round(v)));
	}
	setBars(n: LoopBars) {
		if (this.locked) return;
		this.bars = n;
	}
	setBeatsPerBar(n: 3 | 4) {
		if (this.locked) return;
		this.beatsPerBar = n;
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
	 * when it is the source and not already playing, starts at that bar 1
	 * at the loop's tempo.
	 */
	async record(): Promise<void> {
		if (this.phase === "recording") return;
		if (this.layers.length >= MAX_LOOP_LAYERS) {
			this.notice = `A loop holds at most ${MAX_LOOP_LAYERS} layers.`;
			return;
		}
		if (this.armed === "mic" && !this.#micStream && !(await this.requestMic())) return;
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
		if (source === "drums" && !drumMachine.running) {
			drumMachine.load();
			drumMachine.setBpm(this.bpm);
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
		this.phase = "recording";
	}
	/** Let the pass under way complete, then stop capturing. */
	finishRecording() {
		if (this.phase !== "recording") return;
		this.#worklet!.port.postMessage({ type: "finish" });
	}
	/** Drop the pass under way at once. */
	#cutRecording() {
		this.#passHandler = null;
		this.#worklet?.port.postMessage({ type: "cut" });
		this.#recordingSource = null;
		if (this.phase === "recording") this.phase = "playing";
	}
	cancelRecording() {
		this.#cutRecording();
	}
	#onCapture(m: { type: string; index?: number; channels?: Float32Array[]; lead?: number }) {
		if (m.type === "done") {
			this.#recordingSource = null;
			this.#passHandler = null;
			if (this.phase === "recording") this.phase = "playing";
			return;
		}
		if (m.type !== "pass" || !m.channels || this.#recordingSource === null) return;
		const ctx = this.#ctx!;
		const frames = this.#loopFrames();
		const source = this.#recordingSource;
		// A late microphone is shifted earlier by the measured latency, out of the lead-in; the instruments are on this clock and need none.
		const shift =
			source === "mic"
				? Math.min(m.lead!, Math.round((this.latencyMs / 1000) * ctx.sampleRate))
				: 0;
		const offset = m.lead! - shift;
		const buffer = ctx.createBuffer(2, frames, ctx.sampleRate);
		for (let c = 0; c < 2; c++)
			buffer.getChannelData(c).set(m.channels[c].subarray(offset, offset + frames));
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
	}
	clear() {
		while (this.layers.length > 0) this.remove(this.layers[this.layers.length - 1].id);
	}
	setGain(id: string, gain: number) {
		const l = this.layers.find((x) => x.id === id);
		if (!l) return;
		l.gain = Math.max(0, Math.min(1, gain));
		this.#applyGains();
	}
	toggleMute(id: string) {
		const l = this.layers.find((x) => x.id === id);
		if (!l) return;
		l.muted = !l.muted;
		this.#applyGains();
	}
	toggleSolo(id: string) {
		const l = this.layers.find((x) => x.id === id);
		if (!l) return;
		l.solo = !l.solo;
		this.#applyGains();
	}
	rename(id: string, label: string) {
		const l = this.layers.find((x) => x.id === id);
		if (l) l.label = label.trim().slice(0, 60) || l.label;
	}

	/** Three clicks through the speakers, the microphone recorded, the delay measured (docs/looper.md). */
	async calibrate(): Promise<number | null> {
		if (this.phase !== "idle") return null;
		if (!this.#micStream && !(await this.requestMic())) return null;
		const ctx = this.#ctx!;
		this.calibrating = true;
		this.#openTap("mic");
		const t0 = ctx.currentTime + 0.2;
		const clicks = [0.4, 1.1, 1.8];
		for (const c of clicks) {
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.frequency.value = 1000;
			gain.gain.setValueAtTime(0.0001, t0 + c);
			gain.gain.exponentialRampToValueAtTime(0.9, t0 + c + 0.002);
			gain.gain.exponentialRampToValueAtTime(0.0001, t0 + c + 0.03);
			osc.connect(gain).connect(ctx.destination);
			osc.start(t0 + c);
			osc.stop(t0 + c + 0.05);
		}
		const length = Math.round(2.4 * ctx.sampleRate);
		const recorded = await new Promise<Float32Array | null>((resolve) => {
			const timer = setTimeout(() => resolve(null), 6000);
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
				startFrame: Math.round(t0 * ctx.sampleRate),
				passes: 1,
			});
		});
		this.#passHandler = null;
		this.#openTap(this.armed);
		this.calibrating = false;
		const ms = recorded ? findLatency(recorded, ctx.sampleRate, clicks) : null;
		if (ms !== null) this.setLatencyMs(ms);
		return ms;
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
		const buf = this.#analyserBuf;
		if (buf) {
			const next = { ...this.levels };
			for (const s of LOOP_SOURCES) {
				const a = this.#analysers[s];
				if (!a) continue;
				a.getFloatTimeDomainData(buf);
				let sum = 0;
				for (const x of buf) sum += x * x;
				next[s] = Math.min(1, Math.sqrt(sum / buf.length) * 3);
			}
			this.levels = next;
		}
		this.#frame = requestAnimationFrame(this.#follow);
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
