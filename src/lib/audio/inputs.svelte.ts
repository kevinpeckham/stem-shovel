/**
 * The outside audio sources the looper and the Idea Recorder share
 * (docs/looper.md, "Inputs"): the microphone and a line in (`getUserMedia`,
 * a device each, the voice processors off), and the computer (another
 * program's audio through the browser's share picker). Each comes in
 * through a channel stage (stereo, or one channel on both sides) and a gain
 * stage (−12 to +24 dB, moved live), with a meter and, for the two inputs,
 * a monitor into the speakers that is off by default. The streams belong
 * to this module and outlive a page: a line in opened on the looper is
 * still open on the recorder. The nodes belong to whichever page's
 * AudioContext is attached; `attach` rebuilds them there and hands each
 * source's node to the page through `onsource`, as does every later
 * rewire (another device, another channel mode).
 *
 * Settings are remembered per browser under `stemshovel.inputs.*` (the
 * looper's earlier `stemshovel.looper.*` keys are read once as a fallback).
 */

import { findLatency } from "$lib/utils/findLatency";

export type InputSource = "mic" | "line";
export type OutsideSource = InputSource | "computer";
/** A stereo input as it is, or one channel of it on both sides (an instrument on channel 1 of a stereo interface). */
export type ChannelMode = "stereo" | "left" | "right";
const OUTSIDE_SOURCES: OutsideSource[] = ["mic", "line", "computer"];
export const OUTSIDE_SOURCE_LABELS: Record<OutsideSource, string> = {
	mic: "Microphone",
	line: "Line in",
	computer: "Computer",
};

const KEY = "stemshovel.inputs.";
const OLD_KEY = "stemshovel.looper.";
function readSetting(name: string): string | null {
	try {
		return localStorage.getItem(KEY + name) ?? localStorage.getItem(OLD_KEY + name);
	} catch {
		return null;
	}
}
function writeSetting(name: string, value: string | null) {
	try {
		if (value === null) localStorage.removeItem(KEY + name);
		else localStorage.setItem(KEY + name, value);
	} catch {
		// Private mode: the setting lasts for this page.
	}
}

/** What the context reports for its output path (base plus output latency), in whole milliseconds. */
export function outputLatencyMs(ctx: AudioContext): number {
	return Math.round(
		(ctx.baseLatency + ((ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 0)) *
			1000,
	);
}

class InputSources {
	/** Each source's level for its meter, 0 to 1, every frame while a context is attached. */
	levels = $state<Record<OutsideSource, number>>({ mic: 0, line: 0, computer: 0 });
	/** Each source's device label once it is open, and its last error. */
	labels = $state<Partial<Record<OutsideSource, string | null>>>({});
	errors = $state<Partial<Record<OutsideSource, string | null>>>({});
	/** The audio input devices the browser lists (labels once permission is granted). */
	inputs = $state<{ id: string; label: string }[]>([]);
	/** The device chosen for each input (null: the default). */
	deviceIds = $state<Record<InputSource, string | null>>({ mic: null, line: null });
	channelModes = $state<Record<OutsideSource, ChannelMode>>({
		mic: "stereo",
		line: "stereo",
		computer: "stereo",
	});
	/** Each source's gain in dB (an interface's line input sits well under a microphone's level; Kevin), applied live, so the meter and the recording carry it. */
	inputGainsDb = $state<Record<OutsideSource, number>>({ mic: 0, line: 0, computer: 0 });
	/** Audio from another program arrives late by the capture's own path, which nothing here can measure: a slider, for the looper's shift. */
	computerLatencyMs = $state(0);
	/** Scale what is recorded from these sources so its peak sits at −1 dBFS (never a near-silent one); off by default. */
	normalize = $state(false);
	/** Hear the microphone and the line in through the speakers; off by default (a laptop's speakers feed its microphone). */
	monitor = $state(false);
	/**
	 * How late a sound reaches the computer through the microphone or the line
	 * in (the round trip, usually 10 to 60 ms, more over Bluetooth): the
	 * looper shifts such layers earlier by it, as the Studio does a take
	 * (studio.svelte.ts). Measured by the looper's Calibrate (three
	 * clicks) and remembered; until then the browser's own figure for its
	 * output path, the best guess available.
	 */
	latencyMs = $state(0);
	latencyMeasured = $state(false);
	/** Calibrate is under way (three clicks, about two and a half seconds). */
	calibrating = $state(false);

	#ctx: AudioContext | null = null;
	#monitorOut: AudioNode | null = null;
	#onsource: ((source: OutsideSource, node: AudioNode | null) => void) | null = null;
	#streams: Partial<Record<OutsideSource, MediaStream>> = {};
	#nodes: Partial<Record<OutsideSource, AudioNode>> = {};
	#gains: Partial<Record<OutsideSource, GainNode>> = {};
	#analysers: Partial<Record<OutsideSource, AnalyserNode>> = {};
	#monitors: Partial<Record<InputSource, GainNode>> = {};
	#buf: Float32Array<ArrayBuffer> | null = null;
	#frame = 0;
	#loaded = false;
	/** The capture worklet (static/worklets/loop-capture.js) loaded into a context, once per context; Calibrate records through it. */
	#captureModule = new WeakMap<AudioContext, Promise<void>>();

	/** The remembered settings, once. */
	#load() {
		if (this.#loaded) return;
		this.#loaded = true;
		for (const src of ["mic", "line"] as const) this.deviceIds[src] = readSetting(`${src}-device`);
		for (const src of OUTSIDE_SOURCES) {
			const mode = readSetting(`${src}-channels`);
			if (mode === "stereo" || mode === "left" || mode === "right") this.channelModes[src] = mode;
			const db = Number(readSetting(`${src}-gain-db`));
			if (Number.isFinite(db) && db >= -12 && db <= 24) this.inputGainsDb[src] = db;
		}
		const computer = Number(readSetting("computer-latency-ms"));
		if (Number.isFinite(computer) && computer >= 0) this.computerLatencyMs = computer;
		this.normalize = readSetting("normalize") === "1";
		const latency = Number(readSetting("latency-ms"));
		if (Number.isFinite(latency) && latency > 0) {
			this.latencyMs = latency;
			this.latencyMeasured = true;
		}
	}

	/**
	 * A page's context takes the sources: every open stream is wired into it
	 * (channels, gain, meter, monitor) and handed to the page through
	 * `onsource`. `monitorOut` is where the monitor plays (the page's master).
	 */
	attach(
		ctx: AudioContext,
		opts: {
			monitorOut: AudioNode;
			onsource: (source: OutsideSource, node: AudioNode | null) => void;
			/** The page already loaded the capture worklet into this context (the looper), so Calibrate need not. */
			captureModuleLoaded?: boolean;
		},
	) {
		this.#load();
		if (opts.captureModuleLoaded) this.#captureModule.set(ctx, Promise.resolve());
		if (this.#ctx !== ctx) {
			this.#ctx = ctx;
			this.#gains = {};
			this.#analysers = {};
			this.#monitors = {};
			this.#nodes = {};
			this.#buf = new Float32Array(1024);
		}
		this.#monitorOut = opts.monitorOut;
		this.#onsource = opts.onsource;
		if (!this.latencyMeasured) this.latencyMs = outputLatencyMs(ctx);
		for (const src of OUTSIDE_SOURCES) if (this.#streams[src]) this.#wire(src);
		cancelAnimationFrame(this.#frame);
		this.#meter();
	}
	/** The page is done with the sources (its context is closing); the streams stay open for the next page. */
	detach(ctx?: AudioContext) {
		if (ctx && ctx !== this.#ctx) return;
		cancelAnimationFrame(this.#frame);
		this.#ctx = null;
		this.#monitorOut = null;
		this.#onsource = null;
		this.#nodes = {};
		this.#gains = {};
		this.#analysers = {};
		this.#monitors = {};
		this.levels = { mic: 0, line: 0, computer: 0 };
	}

	/** The source's node in the attached context, after its channel and gain stages; null while the source is not open. */
	output(source: OutsideSource): AudioNode | null {
		return this.#nodes[source] ?? null;
	}
	has(source: OutsideSource) {
		return !!this.#streams[source];
	}
	/** The context the sources are wired into, if any (a page re-attaches when another page took them). */
	get context(): AudioContext | null {
		return this.#ctx;
	}

	/**
	 * The microphone or the line in: the chosen device or the default, with
	 * the voice processors off, as a stereo source; from a gesture. Opening
	 * one again (another device) replaces the earlier one.
	 */
	async requestInput(source: InputSource, deviceId?: string | null): Promise<boolean> {
		this.#load();
		if (deviceId !== undefined) this.setDevice(source, deviceId);
		const id = this.deviceIds[source];
		this.errors[source] = null;
		const constraints = (device: string | null): MediaStreamConstraints => ({
			audio: {
				echoCancellation: false,
				noiseSuppression: false,
				autoGainControl: false,
				sampleRate: { ideal: this.#ctx?.sampleRate ?? 48000 },
				channelCount: { ideal: 2 },
				...(device ? { deviceId: { exact: device } } : {}),
			},
		});
		const missing = (name?: string) => name === "NotFoundError" || name === "OverconstrainedError";
		let stream: MediaStream;
		try {
			try {
				stream = await navigator.mediaDevices.getUserMedia(constraints(id));
			} catch (e) {
				// A remembered device that is gone (an interface unplugged, a headset off) or whose id the browser has
				// since rotated (Safari renews them between sessions): the default input instead, and the choice forgotten
				// (Kevin met "not found" on the Studio with the MacBook's microphone plainly there).
				if (!id || !missing((e as { name?: string }).name)) throw e;
				this.setDevice(source, null);
				stream = await navigator.mediaDevices.getUserMedia(constraints(null));
			}
		} catch (e) {
			const name = (e as { name?: string }).name;
			this.errors[source] =
				name === "NotAllowedError"
					? "Microphone access was refused. Allow it for this site in your browser settings, then try again."
					: missing(name)
						? "No input was found. Plug one in or choose another in its menu."
						: String(e);
			return false;
		}
		this.stop(source);
		this.#streams[source] = stream;
		this.labels[source] = stream.getAudioTracks()[0]?.label || null;
		// A phone call or an unplugged interface ends the track.
		const track = stream.getAudioTracks()[0];
		if (track)
			track.onended = () => {
				if (this.#streams[source] === stream) this.#dropped(source);
			};
		if (this.#ctx) this.#wire(source);
		void this.listInputs();
		return true;
	}
	/**
	 * Audio from another program on the computer, through the browser's share
	 * picker (`getDisplayMedia` with audio: a tab, a window or the whole
	 * screen with "share audio" ticked; the video is dropped at once). What a
	 * browser offers differs: Chrome shares a tab's audio everywhere and the
	 * system's on Windows; on a Mac only a tab's, so another program's audio
	 * needs a loopback device chosen as the line in; Safari shares no audio.
	 */
	async requestComputer(): Promise<boolean> {
		this.#load();
		this.errors.computer = null;
		if (!navigator.mediaDevices?.getDisplayMedia) {
			this.errors.computer =
				'This browser cannot capture the computer\'s audio. Chrome or Edge can (tick "Share audio" in the picker); on a Mac, choose a loopback device as the line in instead.';
			return false;
		}
		let shared: MediaStream;
		try {
			shared = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
		} catch (e) {
			const name = (e as { name?: string }).name;
			this.errors.computer = name === "NotAllowedError" ? "Nothing was shared." : String(e);
			return false;
		}
		for (const t of shared.getVideoTracks()) t.stop();
		const audio = shared.getAudioTracks();
		if (audio.length === 0) {
			this.errors.computer =
				'No audio was shared: pick a tab, window or screen and tick "Share audio" in the picker.';
			return false;
		}
		this.stop("computer");
		const stream = new MediaStream(audio);
		this.#streams.computer = stream;
		this.labels.computer = audio[0]?.label || "Shared audio";
		audio[0].onended = () => {
			if (this.#streams.computer === stream) this.#dropped("computer");
		};
		if (this.#ctx) this.#wire("computer");
		return true;
	}
	/** Ends the source's tracks (the browser's recording indicator goes off); the page is told its node is gone. */
	stop(source: OutsideSource) {
		const stream = this.#streams[source];
		if (!stream) return;
		for (const t of stream.getTracks()) {
			t.onended = null;
			t.stop();
		}
		this.#dropped(source);
	}
	#dropped(source: OutsideSource) {
		delete this.#streams[source];
		this.labels[source] = null;
		this.#unwire(source);
		this.levels[source] = 0;
		this.#onsource?.(source, null);
	}

	/** The audio input devices, for the menus (labels once a microphone was allowed). */
	async listInputs(): Promise<void> {
		try {
			const all = await navigator.mediaDevices.enumerateDevices();
			this.inputs = all
				.filter((d) => d.kind === "audioinput")
				.map((d, i) => ({ id: d.deviceId, label: d.label || `Input ${i + 1}` }));
		} catch {
			this.inputs = [];
		}
	}
	setDevice(source: InputSource, deviceId: string | null) {
		this.deviceIds[source] = deviceId;
		writeSetting(`${source}-device`, deviceId);
	}
	/** The channel mode of a source; an open one is re-wired at once. */
	setChannelMode(source: OutsideSource, mode: ChannelMode) {
		this.channelModes[source] = mode;
		writeSetting(`${source}-channels`, mode);
		if (this.#streams[source] && this.#ctx) this.#wire(source);
	}
	setInputGainDb(source: OutsideSource, db: number) {
		const v = Math.max(-12, Math.min(24, Math.round(db)));
		this.inputGainsDb[source] = v;
		this.#gains[source]?.gain.setTargetAtTime(10 ** (v / 20), this.#ctx?.currentTime ?? 0, 0.02);
		writeSetting(`${source}-gain-db`, String(v));
	}
	setComputerLatencyMs(ms: number) {
		this.computerLatencyMs = Math.max(0, Math.min(500, Math.round(ms)));
		writeSetting("computer-latency-ms", String(this.computerLatencyMs));
	}
	/**
	 * Three clicks through the speakers, the microphone recorded through the
	 * capture worklet in the attached context, the delay measured
	 * (findLatency.ts) and kept as the input latency. Null when the clicks
	 * were not heard (headphones on, the speakers off), nothing attached, or
	 * the microphone refused; the page tells the user. From a gesture.
	 */
	async calibrate(): Promise<number | null> {
		const ctx = this.#ctx;
		if (!ctx || this.calibrating) return null;
		if (!this.has("mic") && !(await this.requestInput("mic"))) return null;
		const node = this.#nodes.mic;
		if (!node) return null;
		this.calibrating = true;
		let worklet: AudioWorkletNode | null = null;
		let sink: GainNode | null = null;
		try {
			let loading = this.#captureModule.get(ctx);
			if (!loading) {
				loading = ctx.audioWorklet.addModule("/worklets/loop-capture.js");
				this.#captureModule.set(ctx, loading);
			}
			await loading;
			if (ctx.state !== "running") await ctx.resume().catch(() => {});
			worklet = new AudioWorkletNode(ctx, "loop-capture", {
				numberOfInputs: 1,
				numberOfOutputs: 1,
				outputChannelCount: [1],
				channelCount: 2,
				channelCountMode: "explicit",
			});
			// A silent output into the destination, so the capture is rendered in every browser (Safari).
			sink = ctx.createGain();
			sink.gain.value = 0;
			node.connect(worklet);
			worklet.connect(sink);
			sink.connect(ctx.destination);
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
			const capture = worklet;
			const recorded = await new Promise<Float32Array | null>((resolve) => {
				const timer = setTimeout(() => resolve(null), 6000);
				capture.port.onmessage = (e: MessageEvent) => {
					const m = e.data as { type: string; channels?: Float32Array[] };
					if (m.type === "pass" && m.channels) {
						clearTimeout(timer);
						resolve(m.channels[0]);
					}
				};
				capture.port.postMessage({
					type: "arm",
					length,
					lead: 0,
					startFrame: Math.round(t0 * ctx.sampleRate),
					passes: 1,
				});
			});
			const ms = recorded ? findLatency(recorded, ctx.sampleRate, clicks) : null;
			if (ms !== null) this.setLatencyMs(ms);
			return ms;
		} catch {
			return null;
		} finally {
			if (worklet) node.disconnect(worklet);
			worklet?.disconnect();
			sink?.disconnect();
			this.calibrating = false;
		}
	}
	setLatencyMs(ms: number) {
		this.latencyMs = Math.max(0, Math.min(500, Math.round(ms)));
		this.latencyMeasured = true;
		writeSetting("latency-ms", String(this.latencyMs));
	}
	setNormalize(on: boolean) {
		this.normalize = on;
		writeSetting("normalize", on ? "1" : "0");
	}
	setMonitor(on: boolean) {
		this.monitor = on;
		for (const m of Object.values(this.#monitors))
			m?.gain.setTargetAtTime(on ? 1 : 0, this.#ctx?.currentTime ?? 0, 0.01);
	}

	/** The source's stream through its channel and gain stages in the attached context, with a meter and (for an input) a monitor; the page gets the node. */
	#wire(source: OutsideSource) {
		const ctx = this.#ctx!;
		const stream = this.#streams[source]!;
		this.#unwire(source);
		let node: AudioNode = ctx.createMediaStreamSource(stream);
		const mode = this.channelModes[source];
		if (mode !== "stereo") {
			const splitter = ctx.createChannelSplitter(2);
			const merger = ctx.createChannelMerger(2);
			node.connect(splitter);
			const ch = mode === "left" ? 0 : 1;
			splitter.connect(merger, ch, 0);
			splitter.connect(merger, ch, 1);
			node = merger;
		}
		const gain = ctx.createGain();
		gain.gain.value = 10 ** (this.inputGainsDb[source] / 20);
		node.connect(gain);
		this.#gains[source] = gain;
		const analyser = ctx.createAnalyser();
		analyser.fftSize = 1024;
		gain.connect(analyser);
		this.#analysers[source] = analyser;
		if (source !== "computer" && this.#monitorOut) {
			const monitor = ctx.createGain();
			monitor.gain.value = this.monitor ? 1 : 0;
			gain.connect(monitor);
			monitor.connect(this.#monitorOut);
			this.#monitors[source] = monitor;
		}
		this.#nodes[source] = gain;
		this.#onsource?.(source, gain);
	}
	#unwire(source: OutsideSource) {
		this.#gains[source]?.disconnect();
		this.#analysers[source]?.disconnect();
		if (source !== "computer") this.#monitors[source]?.disconnect();
		delete this.#gains[source];
		delete this.#analysers[source];
		if (source !== "computer") delete this.#monitors[source];
		delete this.#nodes[source];
	}
	#meter = () => {
		const buf = this.#buf;
		if (!this.#ctx || !buf) return;
		const next = { ...this.levels };
		let changed = false;
		for (const s of OUTSIDE_SOURCES) {
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
		this.#frame = requestAnimationFrame(this.#meter);
	};
}

export const inputSources = new InputSources();
