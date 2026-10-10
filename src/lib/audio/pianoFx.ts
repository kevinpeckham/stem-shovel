import { reverbImpulse } from "./drumBus";
import {
	createChorusStage,
	createCompressorStage,
	createDelayStage,
	createFuzzStage,
	createPhaserStage,
	createRotaryStage,
	createToneStage,
	createTremoloStage,
	createWahStage,
} from "./fxStages";

/**
 * The piano's effect chain (docs/piano.md, "Effects"), built once per
 * context and driven by `update`: voices play into `input`, which runs
 * through a fuzz (a hot gain into a soft clipper, a tone low-pass after),
 * a wah (a resonant band-pass whose centre an envelope follower, an LFO
 * or a MIDI pedal moves), a stereo chorus (two short delays swept by one LFO in opposite
 * directions, mixed against the dry signal), a phaser (four all-pass
 * stages swept by an LFO, mixed against the dry signal so notches move
 * through the sound) or in its place a flanger (a delay of a few
 * milliseconds swept by the LFO, with feedback, mixed the same way, so a
 * comb of notches sweeps instead), a tremolo (a gain swung by an LFO, sine or square)
 * and a rotary speaker (the sound split at 800 Hz into a horn and a drum,
 * each spun by its own LFO through pan, level and a Doppler delay, at a
 * slow or fast speed the LFOs glide between), into the dry bus; from the
 * dry bus, sends into a reverb (the drum machine's synthesized room) and
 * a delay (fxStages.ts, with its analog character), each returning into
 * `master`. Every level is a gain the setters ramp
 * over 20 ms so a slider never clicks. Plain Web Audio: an
 * OfflineAudioContext renders the same, which is how it is measured.
 */
export interface PianoDelaySettings {
	time: number;
	feedback: number;
	level: number;
	/** Tape-like repeats: a soft clip in the loop, a darker damping, a slow wobble of the time. */
	analog: boolean;
}
export interface PianoChorusSettings {
	/** LFO rate in Hz. */
	rate: number;
	/** How far the delays sweep, 0 to 1. */
	depth: number;
	/** Wet level, 0 (off) to 1. */
	mix: number;
}
export interface PianoTremoloSettings {
	/** LFO rate in Hz. */
	rate: number;
	/** How deep the level swings, 0 (off) to 1 (to silence). */
	depth: number;
	shape: "sine" | "square";
}
export interface PianoFuzzSettings {
	/** How hard the clipper is driven, 0 (off) to 1. */
	drive: number;
	/** The low-pass after the clipper, 0 dark to 1 bright. */
	tone: number;
}
export interface PianoPhaserSettings {
	/** A phaser (swept all-pass notches) or a flanger (a short swept delay with feedback); one at a time, the sliders shared. */
	mode: "phaser" | "flanger";
	/** LFO rate in Hz. */
	rate: number;
	/** How far the notches sweep, 0 to 1. */
	depth: number;
	/** Wet level, 0 (off) to 1 (equal to the dry, the deepest notches). */
	mix: number;
}
export interface PianoWahSettings {
	/** Touch: the filter opens with how hard you play (an envelope follower); Sweep: an LFO moves it. A MIDI pedal (wahPedal) takes over either. */
	mode: "touch" | "sweep";
	/** Touch: how far a note opens the filter, 0 to 1. */
	sensitivity: number;
	/** Sweep: LFO rate in Hz. */
	rate: number;
	/** How far the filter can travel above its floor, 0 to 1. */
	range: number;
	/** The filter's peak, 0 gentle to 1 sharp. */
	resonance: number;
	/** Wet level, 0 (off) to 1 (all through the filter). */
	mix: number;
}
export interface PianoToneSettings {
	/** -1 dark to 1 bright, 0 flat. */
	tilt: number;
	/** The exciter, 0 (off) to 1. */
	air: number;
	/** The low-end enhancer, 0 (off) to 1. */
	bottom: number;
}
export interface PianoRotarySettings {
	speed: "off" | "slow" | "fast";
}
export interface PianoCompressorSettings {
	/** 0 (off) to 1: the threshold from 0 down to -40 dB. */
	amount: number;
	ratio: number;
	/** Seconds. */
	attack: number;
	release: number;
	/** Make-up gain in dB. */
	makeup: number;
}
/** The stereo bounce: the sound swung left and right in time with the session tempo (docs/piano.md, "Effects"). */
export interface PianoBounceSettings {
	/** 0 (off) to 1 (hard left and right). */
	depth: number;
	/** How many beats each side lasts. */
	beats: number;
	/** How much of each step is spent on the way, 0 (a jump) to 1. */
	glide: number;
	/** Stops in the centre between the sides. */
	centre: boolean;
	bpm: number;
}
export interface PianoFxSettings {
	volume: number;
	reverb: number;
	reverbSize: number;
	delay: PianoDelaySettings;
	chorus: PianoChorusSettings;
	tremolo: PianoTremoloSettings;
	fuzz: PianoFuzzSettings;
	wah: PianoWahSettings;
	phaser: PianoPhaserSettings;
	rotary: PianoRotarySettings;
	tone: PianoToneSettings;
	compressor: PianoCompressorSettings;
	bounce: PianoBounceSettings;
}

export interface PianoFx {
	/** Where the voices play into. */
	input: AudioNode;
	/** The last node before the destination (the recorder's capture taps it). */
	master: GainNode;
	update(patch: Partial<PianoFxSettings>): void;
	/** A MIDI expression or mod pedal's position, 0 to 1, drives the wah in place of touch or sweep; null hands it back. */
	wahPedal(position: number | null): void;
	/** For the meters: the compressor's gain reduction in dB (0 or below) and where the bounce has the sound (-1 left to 1 right). */
	meters(): { reduction: number; pan: number; threshold: number; ratio: number };
	/** Stops the bounce's scheduler; call when the context is dropped. */
	dispose(): void;
}

const RAMP = 0.02;
export function createPianoFx(ctx: BaseAudioContext, initial: PianoFxSettings): PianoFx {
	const s: PianoFxSettings = structuredClone(initial);
	const ramp = (param: AudioParam, value: number, tau = RAMP) =>
		param.setTargetAtTime(value, ctx.currentTime, tau);
	// The sum of dry, reverb and delay goes through the tone stage (fxStages.ts) into the master.
	const master = ctx.createGain();
	master.gain.value = s.volume;
	master.connect(ctx.destination);
	const sum = ctx.createGain();
	const tone = createToneStage(ctx);
	sum.connect(tone.input);
	// A limiter before the master (Kevin: chords clip easily): a fast compressor at a high ratio
	// catches the peaks of a five-note voicing on the grand piano without touching a single note.
	const limiter = ctx.createDynamicsCompressor();
	limiter.threshold.value = -6;
	limiter.knee.value = 3;
	limiter.ratio.value = 20;
	limiter.attack.value = 0.002;
	limiter.release.value = 0.12;
	tone.output.connect(limiter);
	limiter.connect(master);
	tone.update(s.tone, 0);
	const input = ctx.createGain();

	// Compressor, first in the chain (Kevin: the bass wants it): the voices' sum squeezed before the
	// effects colour it (fxStages.ts: a true bypass at amount 0, make-up gain after).
	const comp = createCompressorStage(ctx);
	comp.update(s.compressor, 0);
	input.connect(comp.input);
	const compOut = comp.output;

	// Fuzz (fxStages.ts): a voice peaks near 0.3.
	const fuzz = createFuzzStage(ctx, 0.3);
	compOut.connect(fuzz.input);
	const fuzzOut = fuzz.output;
	fuzz.update(s.fuzz.drive, s.fuzz.tone, 0);

	// Wah (fxStages.ts): a voice peaks near 0.3; resonance to 15 dB.
	const wah = createWahStage(ctx, 0.3, 15);
	fuzzOut.connect(wah.input);
	const wahOut = wah.output;
	wah.update(s.wah, 0);

	// Chorus, phaser or flanger, tremolo and the rotary (fxStages.ts), in that order.
	const chorus = createChorusStage(ctx);
	wahOut.connect(chorus.input);
	chorus.update(s.chorus, 0);
	const phaser = createPhaserStage(ctx);
	chorus.output.connect(phaser.input);
	phaser.update(s.phaser, 0);
	const trem = createTremoloStage(ctx);
	phaser.output.connect(trem.input);
	trem.update(s.tremolo, 0);
	const rotary = createRotaryStage(ctx);
	trem.output.connect(rotary.input);
	rotary.update(s.rotary.speed, 0);
	const rotaryOut = rotary.output;

	// The stereo bounce: a panner after the rotary, before the sends (so the room hears the sound move),
	// its pan written ahead on the clock in steps of the session tempo: left, right (and the centre
	// between, when asked), each step a jump or a glide of up to the whole step. Live, a timer keeps
	// a second scheduled; offline, the whole render is written at once.
	const bounce = ctx.createStereoPanner();
	rotaryOut.connect(bounce);
	let bounceOrigin = ctx.currentTime;
	let bounceUntil = ctx.currentTime;
	let bounceTimer: ReturnType<typeof setInterval> | null = null;
	/** The last target written, so each step glides from where the sound is (and a change of settings from wherever it was). */
	let bounceLast = 0;
	const bounceStep = () => (60 / Math.max(1, s.bounce.bpm)) * s.bounce.beats;
	const bounceTargets = () => {
		const d = s.bounce.depth;
		return s.bounce.centre ? [-d, 0, d, 0] : [-d, d];
	};
	const scheduleBounce = (until: number) => {
		const step = bounceStep();
		const targets = bounceTargets();
		let k = Math.max(0, Math.ceil((bounceUntil - bounceOrigin) / step - 1e-6));
		while (bounceOrigin + k * step < until) {
			const at = bounceOrigin + k * step;
			const target = targets[k % targets.length]!;
			const glide = Math.max(0.005, s.bounce.glide * step);
			bounce.pan.setValueAtTime(bounceLast, at);
			bounce.pan.linearRampToValueAtTime(target, at + glide);
			bounceLast = target;
			k += 1;
		}
		bounceUntil = Math.max(bounceUntil, until);
	};
	const live = typeof AudioContext !== "undefined" && ctx instanceof AudioContext;
	const applyBounce = () => {
		const now = ctx.currentTime;
		bounce.pan.cancelScheduledValues(now);
		if (s.bounce.depth <= 0) {
			bounce.pan.setTargetAtTime(0, now, RAMP);
			if (bounceTimer) clearInterval(bounceTimer);
			bounceTimer = null;
			return;
		}
		// The pattern keeps its phase through a change: the next step comes where it would have.
		const step = bounceStep();
		if (now - bounceOrigin > step * 64 || bounceUntil <= now) bounceOrigin = now;
		bounceUntil = now;
		bounceLast = bounce.pan.value;
		bounce.pan.setValueAtTime(bounceLast, now);
		if (live) {
			scheduleBounce(now + 1);
			if (!bounceTimer) bounceTimer = setInterval(() => scheduleBounce(ctx.currentTime + 1), 250);
		} else {
			scheduleBounce(now + (ctx as OfflineAudioContext).length / ctx.sampleRate + 1);
		}
	};
	if (s.bounce.depth > 0) applyBounce();

	// The dry bus, and the two sends.
	const dry = ctx.createGain();
	bounce.connect(dry);
	dry.connect(sum);

	const convolver = ctx.createConvolver();
	convolver.buffer = reverbImpulse(ctx, s.reverbSize);
	const wet = ctx.createGain();
	wet.gain.value = s.reverb * 0.5;
	dry.connect(convolver);
	convolver.connect(wet);
	wet.connect(sum);

	const delay = createDelayStage(ctx, 1);
	dry.connect(delay.input);
	delay.output.connect(sum);
	delay.update(s.delay, 0);

	const apply: { [K in keyof PianoFxSettings]: (v: PianoFxSettings[K]) => void } = {
		volume: (v) => ramp(master.gain, v),
		reverb: (v) => ramp(wet.gain, v * 0.5),
		reverbSize: (v) => {
			if (v !== s.reverbSize) convolver.buffer = reverbImpulse(ctx, v);
		},
		delay: (d) => delay.update(d, RAMP),
		chorus: (c) => chorus.update(c, RAMP),
		tremolo: (t) => trem.update(t, RAMP),
		fuzz: (f) => fuzz.update(f.drive, f.tone, RAMP),
		wah: (w) => wah.update(w, RAMP),
		phaser: (p) => phaser.update(p, RAMP),
		rotary: (r) => rotary.update(r.speed, RAMP),
		tone: (t) => tone.update(t, RAMP),
		compressor: (c) => comp.update(c, RAMP),
		bounce: (b) => {
			const was = s.bounce;
			s.bounce = b;
			// A new tempo, division or depth reschedules; the same settings again leave the pattern running.
			if (
				b.bpm !== was.bpm ||
				b.beats !== was.beats ||
				b.depth !== was.depth ||
				b.glide !== was.glide ||
				b.centre !== was.centre
			)
				applyBounce();
		},
	};

	return {
		input,
		master,
		wahPedal: (position) => wah.pedal(position),
		meters: () => ({ ...comp.meters(), pan: bounce.pan.value }),
		dispose: () => {
			if (bounceTimer) clearInterval(bounceTimer);
			bounceTimer = null;
		},
		update(patch) {
			for (const key of Object.keys(patch) as (keyof PianoFxSettings)[]) {
				const value = patch[key];
				if (value === undefined) continue;
				// A nested setting merges over what stands, so a slider can send its one field.
				const merged =
					typeof value === "object" ? { ...(s[key] as object), ...(value as object) } : value;
				(apply[key] as (v: unknown) => void)(merged);
				(s as unknown as Record<string, unknown>)[key] = merged;
			}
		},
	};
}
