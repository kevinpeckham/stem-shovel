import { inputSources, outputLatencyMs, type InputSource } from "#lib/audio/inputs.svelte.js";
import { metronome } from "#lib/audio/metronome.svelte.js";
import { drumMachine } from "#lib/audio/drumMachine.svelte.js";
import { playThroughSilentSwitch } from "#lib/audio/playThroughSilentSwitch.js";
import { AMP_MODELS } from "#lib/constants/amp.js";
import { audioSession } from "#lib/utils/audioSession.js";
import {
	loadAmpPreferences,
	parseAmpPreferences,
	saveAmpPreferences,
	defaultRig,
} from "#lib/utils/ampPreferences.js";
import { looksBluetooth } from "#lib/utils/latencyVerdict.js";
import type {
	AmpHead,
	AmpInputMode,
	AmpInstrument,
	AmpModelId,
	AmpPedals,
	AmpPreferences,
	AmpRig,
} from "#lib/val/AmpSchema.js";
import { createAmpChain, type AmpChain } from "./ampChain";

/**
 * The one Practice Amp on the page (docs/practice-amp.md): an input from
 * the shared inputs module (the line in or the microphone jack) through
 * the amp chain (ampChain.ts) to the speakers, with meters at both ends.
 * Its own AudioContext with the interactive latency hint, which hosts
 * the metronome and the drum machine so a click or a beat shares one
 * output and one latency. Settings are remembered per browser
 * (utils/ampPreferences.ts). The context, once made, outlives the page
 * as the looper's does; leaving the page turns the amp off, which mutes
 * it and closes the input. Hosted (`hostContext`), the amp lives in the
 * looper's or the Studio's context as a source of theirs.
 */
class AmpEngine {
	prefs = $state<AmpPreferences>(parseAmpPreferences({}));
	/** The amp is open and the input live. */
	on = $state(false);
	/** Between the switch and the input being live (the permission prompt, the context waking). */
	starting = $state(false);
	error = $state<string | null>(null);
	/** The input's level after the trim and the output's, 0 to 1, every frame while on; `clip` holds for a moment after a peak reached full scale. */
	inputLevel = $state(0);
	outputLevel = $state(0);
	clip = $state(false);
	/** The context's own output path in ms, and the output device as the browser names it (Chrome lists outputs; others do not). */
	outputLatencyMs = $state(0);
	outputLabel = $state<string | null>(null);
	bluetooth = $state(false);
	/** Set level is listening (three seconds). */
	settingLevel = $state(false);

	#ctx: AudioContext | null = null;
	#chain: AmpChain | null = null;
	#inAnalyser: AnalyserNode | null = null;
	#outAnalyser: AnalyserNode | null = null;
	#buf = new Float32Array(1024);
	#frame = 0;
	#source: AudioNode | null = null;
	#capture: MediaStreamAudioDestinationNode | null = null;
	#clipUntil = 0;
	#loaded = false;
	/** The context belongs to a host (the looper, the Studio): the amp built its chain there and never attaches the inputs itself. */
	#hosted = false;
	#unlisten: (() => void) | null = null;

	/**
	 * Builds the amp's chain in a host's context instead of one of its own
	 * (the looper and the Studio, as the piano does), so the host can tap
	 * `output()` sample-accurately. The host attaches the inputs; the amp
	 * listens for its source's node. A context the amp already made is
	 * dropped (its input closed).
	 */
	hostContext(ctx: AudioContext) {
		if (this.#ctx === ctx) return;
		this.load();
		if (this.on) void this.setOn(false);
		this.#unlisten?.();
		this.#capture = null;
		if (this.#ctx && !this.#hosted) void this.#ctx.close().catch(() => {});
		this.#ctx = ctx;
		this.#hosted = true;
		this.#build(ctx);
		this.#unlisten = inputSources.listen((source, node) => {
			if (source === this.prefs.source && this.on) this.#take(node);
		});
	}
	/** The chain and the meters in a context; the output to its destination. */
	#build(ctx: AudioContext) {
		const chain = createAmpChain(ctx, $state.snapshot(this.rig));
		this.#chain = chain;
		chain.output.connect(ctx.destination);
		this.#inAnalyser = ctx.createAnalyser();
		this.#inAnalyser.fftSize = 1024;
		chain.input.connect(this.#inAnalyser);
		this.#outAnalyser = ctx.createAnalyser();
		this.#outAnalyser.fftSize = 1024;
		chain.output.connect(this.#outAnalyser);
		this.outputLatencyMs = outputLatencyMs(ctx);
	}

	/** The remembered settings, once, in the browser. */
	load() {
		if (this.#loaded || typeof localStorage === "undefined") return;
		this.#loaded = true;
		this.prefs = loadAmpPreferences();
	}
	#save() {
		saveAmpPreferences($state.snapshot(this.prefs));
	}

	get instrument(): AmpInstrument {
		return this.prefs.instrument;
	}
	get rig(): AmpRig {
		return this.prefs[this.prefs.instrument];
	}
	get model() {
		return AMP_MODELS[this.rig.model];
	}
	get source(): InputSource {
		return this.prefs.source;
	}
	get inputMode(): AmpInputMode {
		return this.prefs.inputMode;
	}
	get trimDb(): number {
		return this.prefs.trimDb[this.prefs.inputMode];
	}
	/** The context the amp plays in, for the tuner and a host. */
	get context(): AudioContext | null {
		return this.#ctx;
	}

	/**
	 * The context and the chain, built on the first switch-on (from a
	 * gesture): the inputs module is attached here, the metronome and the
	 * drum machine hosted, and the chosen input opened.
	 */
	async open(): Promise<boolean> {
		this.load();
		this.error = null;
		if (!this.#ctx) {
			playThroughSilentSwitch();
			const session = audioSession();
			if (session) session.type = "play-and-record";
			const ctx = new AudioContext({ latencyHint: "interactive" });
			this.#ctx = ctx;
			this.#hosted = false;
			metronome.hostContext(ctx);
			drumMachine.hostContext(ctx);
			this.#build(ctx);
			this.#unlisten?.();
			this.#unlisten = inputSources.listen((source, node) => {
				if (source === this.prefs.source && this.on) this.#take(node);
			});
			this.#attachInputs(ctx);
		} else if (!this.#hosted && inputSources.context !== this.#ctx) {
			// Another page took the inputs since: back here.
			this.#attachInputs(this.#ctx);
		}
		if (this.#ctx.state !== "running") await this.#ctx.resume().catch(() => {});
		inputSources.setInputGainDb(this.prefs.source, this.trimDb);
		const ok =
			inputSources.has(this.prefs.source) || (await inputSources.requestInput(this.prefs.source));
		if (ok) this.#take(inputSources.output(this.prefs.source));
		else this.error = inputSources.errors[this.prefs.source] ?? "The input could not be opened.";
		void this.#checkOutputs();
		return ok;
	}
	/** The inputs module in the amp's own context. Its own monitor would double the dry signal under the amp: it plays into a muted gain. */
	#attachInputs(ctx: AudioContext) {
		const mute = ctx.createGain();
		mute.gain.value = 0;
		mute.connect(ctx.destination);
		inputSources.attach(ctx, { monitorOut: mute, onsource: () => {} });
	}
	/** The input's node into the chain (or nothing, when the input closed). */
	#take(node: AudioNode | null) {
		if (this.#source && this.#chain) {
			try {
				this.#source.disconnect(this.#chain.input);
			} catch {
				// Already gone.
			}
		}
		this.#source = node;
		if (node && this.#chain) node.connect(this.#chain.input);
	}
	/** The output device, as far as the browser says: Chrome lists outputs once an input is allowed; the label tells a Bluetooth one. */
	async #checkOutputs() {
		try {
			const all = await navigator.mediaDevices.enumerateDevices();
			const outs = all.filter((d) => d.kind === "audiooutput");
			const current = outs.find((d) => d.deviceId === "default") ?? outs[0];
			this.outputLabel = current?.label || null;
			this.bluetooth = outs.some((d) => d.deviceId === "default" && looksBluetooth(d.label));
		} catch {
			this.outputLabel = null;
			this.bluetooth = false;
		}
	}

	/** The switch: on opens the input and plays; off mutes and closes the input (the browser's recording light goes out). */
	async setOn(on: boolean) {
		if (on === this.on || this.starting) return;
		if (!on) {
			this.on = false;
			cancelAnimationFrame(this.#frame);
			this.inputLevel = this.outputLevel = 0;
			this.#take(null);
			// On its own page Off closes the input (the recording light goes out); hosted, the host's other sources may still want it.
			if (!this.#hosted) inputSources.stop(this.prefs.source);
			return;
		}
		this.starting = true;
		try {
			const ok = await this.open();
			this.on = ok;
			if (ok) {
				cancelAnimationFrame(this.#frame);
				this.#meter();
			}
		} finally {
			this.starting = false;
		}
	}
	#meter = () => {
		if (!this.on) return;
		const now = performance.now();
		const read = (a: AnalyserNode | null) => {
			if (!a) return { rms: 0, peak: 0 };
			a.getFloatTimeDomainData(this.#buf);
			let sum = 0;
			let peak = 0;
			for (const x of this.#buf) {
				sum += x * x;
				peak = Math.max(peak, Math.abs(x));
			}
			return { rms: Math.sqrt(sum / this.#buf.length), peak };
		};
		const input = read(this.#inAnalyser);
		const output = read(this.#outAnalyser);
		if (input.peak >= 0.98) this.#clipUntil = now + 400;
		const clip = now < this.#clipUntil;
		const inLevel = Math.min(1, input.rms * 3);
		const outLevel = Math.min(1, output.rms * 3);
		if (inLevel !== this.inputLevel) this.inputLevel = inLevel;
		if (outLevel !== this.outputLevel) this.outputLevel = outLevel;
		if (clip !== this.clip) this.clip = clip;
		this.#frame = requestAnimationFrame(this.#meter);
	};

	#apply(tau = 0.02) {
		this.#chain?.update($state.snapshot(this.rig), tau);
		this.#save();
	}
	setInstrument(instrument: AmpInstrument) {
		if (instrument === this.prefs.instrument) return;
		this.prefs.instrument = instrument;
		this.#apply();
	}
	setModel(model: AmpModelId) {
		const m = AMP_MODELS[model];
		if (m.instrument !== this.prefs.instrument) this.prefs.instrument = m.instrument;
		const rig = this.prefs[m.instrument];
		if (rig.model === model) return;
		// The head takes the model's own starting knobs; the pedals stay as they were.
		this.prefs[m.instrument] = { ...defaultRig(model), pedals: rig.pedals };
		this.#apply();
	}
	/** The master as the looper's and the recorder's source sliders see it, 0 to 1. */
	get volume(): number {
		return this.rig.head.master;
	}
	setVolume(v: number) {
		this.setHead({ master: Math.max(0, Math.min(1, v)) });
	}
	setHead(patch: Partial<AmpHead>) {
		Object.assign(this.rig.head, patch);
		this.#apply();
	}
	setTremolo(patch: Partial<AmpHead["tremolo"]>) {
		Object.assign(this.rig.head.tremolo, patch);
		this.#apply();
	}
	setPedal<K extends keyof AmpPedals>(pedal: K, patch: Partial<AmpPedals[K]>) {
		Object.assign(this.rig.pedals[pedal], patch);
		this.#apply();
	}
	/** Every pedal off and the head back at the model's defaults. */
	resetRig() {
		this.prefs[this.prefs.instrument] = defaultRig(this.rig.model);
		this.#apply();
	}
	wahPedal(position: number | null) {
		this.#chain?.wahPedal(position);
	}
	meters() {
		return this.#chain?.meters() ?? { reduction: 0 };
	}

	/** Which jack: the line in or the microphone input (inputs.svelte.ts); an open amp moves to it. */
	async setSource(source: InputSource) {
		if (source === this.prefs.source) return;
		const was = this.prefs.source;
		this.prefs.source = source;
		this.#save();
		if (this.on) {
			this.#take(null);
			if (!this.#hosted) inputSources.stop(was);
			await this.open();
		}
	}
	/** Instrument or line: each keeps its own trim. */
	setInputMode(mode: AmpInputMode) {
		this.prefs.inputMode = mode;
		this.#save();
		if (this.#ctx) inputSources.setInputGainDb(this.prefs.source, this.trimDb);
	}
	setTrimDb(db: number) {
		const v = Math.max(-12, Math.min(24, Math.round(db)));
		this.prefs.trimDb[this.prefs.inputMode] = v;
		this.#save();
		inputSources.setInputGainDb(this.prefs.source, v);
	}
	/**
	 * Set level: listens for three seconds of playing and sets the trim so
	 * the loudest peak lands around −12 dBFS, the headroom the chain
	 * expects. Nothing changes when nothing was heard.
	 */
	async setLevel(): Promise<number | null> {
		if (!this.on || this.settingLevel || !this.#inAnalyser) return null;
		this.settingLevel = true;
		try {
			let peak = 0;
			const analyser = this.#inAnalyser;
			const buf = new Float32Array(analyser.fftSize);
			const until = performance.now() + 3000;
			await new Promise<void>((resolve) => {
				const tick = () => {
					analyser.getFloatTimeDomainData(buf);
					for (const x of buf) peak = Math.max(peak, Math.abs(x));
					if (performance.now() < until) requestAnimationFrame(tick);
					else resolve();
				};
				tick();
			});
			if (peak < 0.002) return null;
			const db = this.trimDb + 20 * Math.log10(0.25 / peak);
			this.setTrimDb(db);
			return this.trimDb;
		} finally {
			this.settingLevel = false;
		}
	}
	/** Three clicks through the speakers, measured by the microphone (inputs.svelte.ts); the round trip in ms, or null when unheard. */
	calibrate(): Promise<number | null> {
		return inputSources.calibrate();
	}

	/** The last node before the destination, for a host to tap. */
	output(): AudioNode | null {
		return this.#chain?.output ?? null;
	}
	/** The input as it enters the chain (after the trim), for the tuner. */
	inputTap(): { ctx: AudioContext; node: AudioNode } | null {
		return this.#ctx && this.#chain ? { ctx: this.#ctx, node: this.#chain.input } : null;
	}
	/** The amp's sound as a MediaStream, for the Idea Recorder to mix into a take; call once the amp is open. */
	captureStream(): MediaStream | null {
		if (!this.#ctx || !this.#chain) return null;
		if (!this.#capture) {
			this.#capture = this.#ctx.createMediaStreamDestination();
			this.#chain.output.connect(this.#capture);
		}
		return this.#capture.stream;
	}

	/**
	 * The chain rendered offline over a test signal (the dev hook and the
	 * browser tests): `seconds` of a sawtooth at `hz` peaking at 0.5, through
	 * the rig in force, as RMS and peak of what comes out.
	 */
	async render(seconds = 1, hz = 110): Promise<{ rms: number; peak: number }> {
		const rate = 48000;
		const ctx = new OfflineAudioContext(2, Math.round(seconds * rate), rate);
		const chain = createAmpChain(ctx, $state.snapshot(this.rig));
		chain.output.connect(ctx.destination);
		const osc = ctx.createOscillator();
		osc.type = "sawtooth";
		osc.frequency.value = hz;
		const level = ctx.createGain();
		level.gain.value = 0.5;
		osc.connect(level);
		level.connect(chain.input);
		osc.start();
		const buffer = await ctx.startRendering();
		const data = buffer.getChannelData(0);
		let sum = 0;
		let peak = 0;
		// Skip the first tenth: the ramps and the convolver settle.
		for (let i = Math.round(data.length / 10); i < data.length; i++) {
			sum += data[i]! * data[i]!;
			peak = Math.max(peak, Math.abs(data[i]!));
		}
		return { rms: Math.sqrt(sum / (data.length * 0.9)), peak };
	}
}

export const amp = new AmpEngine();
