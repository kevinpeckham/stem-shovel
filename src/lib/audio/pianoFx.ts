import { reverbImpulse } from "./drumBus";

/**
 * The piano's effect chain (docs/piano.md, "Effects"), built once per
 * context and driven by `update`: voices play into `input`, which runs
 * through a stereo chorus (two short delays swept by one LFO in
 * opposite directions, mixed against the dry signal), then a tremolo (a
 * gain swung by a second LFO, sine or square), into the dry bus; from the
 * dry bus, sends into a reverb (the drum machine's synthesized room) and
 * a delay (delay → damping → feedback, with an "analog" character: a
 * soft clip in the loop, darker repeats and a slow wobble of the time),
 * each returning into `master`. Every level is a gain the setters ramp
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
export interface PianoFxSettings {
	volume: number;
	reverb: number;
	reverbSize: number;
	delay: PianoDelaySettings;
	chorus: PianoChorusSettings;
	tremolo: PianoTremoloSettings;
}

export interface PianoFx {
	/** Where the voices play into. */
	input: AudioNode;
	/** The last node before the destination (the recorder's capture taps it). */
	master: GainNode;
	update(patch: Partial<PianoFxSettings>): void;
}

const RAMP = 0.02;
/**
 * A gentle soft clip for the analog delay's loop (unity at small signals,
 * so the feedback stays what the slider says; the peaks fold down as tape
 * saturates); identity for the digital one.
 */
function shaperCurve(analog: boolean): Float32Array<ArrayBuffer> {
	const n = 1024;
	const curve = new Float32Array(new ArrayBuffer(n * 4));
	for (let i = 0; i < n; i++) {
		const x = (i / (n - 1)) * 2 - 1;
		curve[i] = analog ? Math.tanh(x * 1.6) / 1.6 : x;
	}
	return curve;
}

export function createPianoFx(ctx: BaseAudioContext, initial: PianoFxSettings): PianoFx {
	const s: PianoFxSettings = structuredClone(initial);
	const master = ctx.createGain();
	master.gain.value = s.volume;
	master.connect(ctx.destination);

	// Chorus: dry through at full, the two swept delays at `mix`, panned apart.
	const input = ctx.createGain();
	const chorusOut = ctx.createGain();
	input.connect(chorusOut);
	const chorusWet = ctx.createGain();
	chorusWet.gain.value = s.chorus.mix;
	const chorusLfo = ctx.createOscillator();
	chorusLfo.type = "sine";
	chorusLfo.frequency.value = s.chorus.rate;
	const chorusDepth = ctx.createGain();
	chorusDepth.gain.value = s.chorus.depth * 0.004; // up to ±4 ms
	chorusLfo.connect(chorusDepth);
	const chorusDepthInv = ctx.createGain();
	chorusDepthInv.gain.value = -1;
	chorusDepth.connect(chorusDepthInv);
	for (const [base, pan, mod] of [
		[0.022, -0.6, chorusDepth],
		[0.028, 0.6, chorusDepthInv],
	] as const) {
		const d = ctx.createDelay(0.1);
		d.delayTime.value = base;
		mod.connect(d.delayTime);
		const p = ctx.createStereoPanner();
		p.pan.value = pan;
		input.connect(d);
		d.connect(p);
		p.connect(chorusWet);
	}
	chorusWet.connect(chorusOut);
	chorusLfo.start();

	// Tremolo: the gain sits at 1 - depth/2 and the LFO swings it by ±depth/2.
	const trem = ctx.createGain();
	trem.gain.value = 1 - s.tremolo.depth / 2;
	const tremLfo = ctx.createOscillator();
	tremLfo.type = s.tremolo.shape;
	tremLfo.frequency.value = s.tremolo.rate;
	const tremDepth = ctx.createGain();
	tremDepth.gain.value = s.tremolo.depth / 2;
	tremLfo.connect(tremDepth);
	tremDepth.connect(trem.gain);
	tremLfo.start();
	chorusOut.connect(trem);

	// The dry bus, and the two sends.
	const dry = ctx.createGain();
	trem.connect(dry);
	dry.connect(master);

	const convolver = ctx.createConvolver();
	convolver.buffer = reverbImpulse(ctx, s.reverbSize);
	const wet = ctx.createGain();
	wet.gain.value = s.reverb * 0.5;
	dry.connect(convolver);
	convolver.connect(wet);
	wet.connect(master);

	const delay = ctx.createDelay(1.1);
	delay.delayTime.value = s.delay.time;
	const shaper = ctx.createWaveShaper();
	shaper.curve = shaperCurve(s.delay.analog);
	const damping = ctx.createBiquadFilter();
	damping.type = "lowpass";
	damping.frequency.value = s.delay.analog ? 2000 : 3200;
	const feedback = ctx.createGain();
	feedback.gain.value = s.delay.feedback;
	const delayReturn = ctx.createGain();
	delayReturn.gain.value = s.delay.level;
	dry.connect(delay);
	delay.connect(shaper);
	shaper.connect(damping);
	damping.connect(feedback);
	feedback.connect(delay);
	delay.connect(delayReturn);
	delayReturn.connect(master);
	// The wobble: a slow LFO on the time, only in analog.
	const wobble = ctx.createOscillator();
	wobble.frequency.value = 0.4;
	const wobbleDepth = ctx.createGain();
	wobbleDepth.gain.value = s.delay.analog ? 0.0015 : 0;
	wobble.connect(wobbleDepth);
	wobbleDepth.connect(delay.delayTime);
	wobble.start();

	const ramp = (param: AudioParam, value: number) =>
		param.setTargetAtTime(value, ctx.currentTime, RAMP);

	return {
		input,
		master,
		update(patch) {
			if (patch.volume !== undefined) ramp(master.gain, (s.volume = patch.volume));
			if (patch.reverb !== undefined) ramp(wet.gain, (s.reverb = patch.reverb) * 0.5);
			if (patch.reverbSize !== undefined && patch.reverbSize !== s.reverbSize) {
				s.reverbSize = patch.reverbSize;
				convolver.buffer = reverbImpulse(ctx, s.reverbSize);
			}
			if (patch.delay) {
				const d = { ...s.delay, ...patch.delay };
				ramp(delay.delayTime, d.time);
				ramp(feedback.gain, d.feedback);
				ramp(delayReturn.gain, d.level);
				if (d.analog !== s.delay.analog) shaper.curve = shaperCurve(d.analog);
				ramp(damping.frequency, d.analog ? 2000 : 3200);
				ramp(wobbleDepth.gain, d.analog ? 0.0015 : 0);
				s.delay = d;
			}
			if (patch.chorus) {
				const c = { ...s.chorus, ...patch.chorus };
				ramp(chorusLfo.frequency, c.rate);
				ramp(chorusDepth.gain, c.depth * 0.004);
				ramp(chorusWet.gain, c.mix);
				s.chorus = c;
			}
			if (patch.tremolo) {
				const t = { ...s.tremolo, ...patch.tremolo };
				if (t.shape !== s.tremolo.shape) tremLfo.type = t.shape;
				ramp(tremLfo.frequency, t.rate);
				ramp(trem.gain, 1 - t.depth / 2);
				ramp(tremDepth.gain, t.depth / 2);
				s.tremolo = t;
			}
		},
	};
}
