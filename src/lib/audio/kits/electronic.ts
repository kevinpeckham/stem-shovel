import type { DrumVoiceId } from "$lib/constants/drumMachine";
import type { DrumHit, DrumKit } from "./types";

/**
 * The electronic kit: oscillators, noise and envelopes in the 808 manner,
 * so it needs no files and works offline. Every voice is a short graph
 * built per hit and released when its envelope has died.
 */
export class ElectronicKit implements DrumKit {
	readonly id = "electronic" as const;
	#noise: { ctx: AudioContext; buffer: AudioBuffer } | null = null;

	load(): Promise<void> {
		return Promise.resolve();
	}

	/** A second of white noise, made once per context. */
	#noiseBuffer(ctx: AudioContext): AudioBuffer {
		if (this.#noise?.ctx === ctx) return this.#noise.buffer;
		const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
		const data = buffer.getChannelData(0);
		for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
		this.#noise = { ctx, buffer };
		return buffer;
	}

	play(voice: DrumVoiceId, ctx: AudioContext, at: number, gain: number, out: AudioNode): DrumHit {
		const master = ctx.createGain();
		master.gain.value = gain;
		master.connect(out);
		const stops: ((t: number) => void)[] = [];
		const env = (node: GainNode, peak: number, decay: number, attack = 0.002) => {
			node.gain.setValueAtTime(0.0001, at);
			node.gain.exponentialRampToValueAtTime(peak, at + attack);
			node.gain.exponentialRampToValueAtTime(0.0001, at + decay);
		};
		const tone = (
			type: OscillatorType,
			from: number,
			to: number,
			sweep: number,
			peak: number,
			decay: number,
		) => {
			const osc = ctx.createOscillator();
			const g = ctx.createGain();
			osc.type = type;
			osc.frequency.setValueAtTime(from, at);
			if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, at + sweep);
			env(g, peak, decay);
			osc.connect(g).connect(master);
			osc.start(at);
			osc.stop(at + decay + 0.05);
			stops.push((t) => osc.stop(t));
		};
		const noise = (
			filter: BiquadFilterType,
			frequency: number,
			peak: number,
			decay: number,
			startAt = at,
			q = 1,
		) => {
			const src = ctx.createBufferSource();
			src.buffer = this.#noiseBuffer(ctx);
			const f = ctx.createBiquadFilter();
			f.type = filter;
			f.frequency.value = frequency;
			f.Q.value = q;
			const g = ctx.createGain();
			g.gain.setValueAtTime(0.0001, startAt);
			g.gain.exponentialRampToValueAtTime(peak, startAt + 0.002);
			g.gain.exponentialRampToValueAtTime(0.0001, startAt + decay);
			src.connect(f).connect(g).connect(master);
			src.start(startAt);
			src.stop(startAt + decay + 0.05);
			stops.push((t) => src.stop(t));
		};

		switch (voice) {
			case "kick":
				tone("sine", 150, 45, 0.04, 1, 0.35);
				noise("lowpass", 800, 0.3, 0.02);
				break;
			case "snare":
				tone("triangle", 200, 180, 0.05, 0.5, 0.12);
				noise("bandpass", 2500, 0.8, 0.18, at, 0.7);
				break;
			case "hat-closed":
				noise("highpass", 7000, 0.5, 0.05);
				break;
			case "hat-open":
				noise("highpass", 6000, 0.45, 0.35);
				break;
			case "clap":
				for (const d of [0, 0.01, 0.02])
					noise("bandpass", 1500, 1, d === 0.02 ? 0.18 : 0.03, at + d, 0.6);
				break;
			case "rim":
				tone("sine", 1000, 1000, 0, 0.6, 0.02);
				noise("bandpass", 3000, 0.3, 0.02, at, 3);
				break;
			case "tom-low":
				tone("sine", 120, 80, 0.15, 0.9, 0.4);
				break;
			case "tom-mid":
				tone("sine", 180, 120, 0.12, 0.9, 0.32);
				break;
			case "tom-high":
				tone("sine", 260, 180, 0.1, 0.9, 0.25);
				break;
			case "ride":
				noise("highpass", 5000, 0.25, 0.6);
				tone("square", 520, 520, 0, 0.08, 0.5);
				break;
			case "crash":
				noise("highpass", 4000, 0.5, 1.2);
				break;
			case "cowbell":
				tone("square", 560, 560, 0, 0.25, 0.25);
				tone("square", 845, 845, 0, 0.25, 0.25);
				break;
		}
		return {
			stop(t) {
				master.gain.setTargetAtTime(0, t, 0.01);
				for (const s of stops) s(t + 0.05);
			},
		};
	}
}
