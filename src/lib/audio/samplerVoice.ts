import type { StudioSampler } from "#lib/val/StudioSchema.js";
import type { SampledVoice } from "./pianoSamples";

/**
 * One note of the sampler (docs/dawn-daw-plan.md, D6): the recording
 * played from its start at the rate that moves its root note to the key
 * (a semitone is the twelfth root of two), through a gain with the
 * attack on the way in and the release on the way out, looping when
 * asked. Plain Web Audio on any context, so the bounce renders it the
 * same. Velocity sets the level (a square law, as the piano's single
 * layer does).
 */
export function startSamplerVoice(
	ctx: BaseAudioContext,
	out: AudioNode,
	buffer: AudioBuffer,
	settings: Pick<StudioSampler, "root" | "attack" | "release" | "loop">,
	pitch: number,
	velocity: number,
	when: number,
): SampledVoice {
	const v = Math.min(1, Math.max(0, velocity));
	const gain = ctx.createGain();
	const peak = 0.15 + 0.85 * v * v;
	gain.gain.setValueAtTime(0.0001, when);
	gain.gain.linearRampToValueAtTime(peak, when + Math.max(0.001, settings.attack));
	gain.connect(out);
	const source = ctx.createBufferSource();
	source.buffer = buffer;
	const rate = 2 ** ((pitch - settings.root) / 12);
	source.playbackRate.value = rate;
	source.loop = settings.loop;
	source.connect(gain);
	source.start(when);
	let released = false;
	return {
		bend(semitones, at) {
			source.playbackRate.setTargetAtTime(rate * 2 ** (semitones / 12), at, 0.005);
		},
		release(at) {
			if (released) return;
			released = true;
			const tail = Math.max(0.005, settings.release);
			gain.gain.cancelScheduledValues(at);
			gain.gain.setValueAtTime(gain.gain.value, at);
			gain.gain.linearRampToValueAtTime(0.0001, at + tail);
			source.stop(at + tail + 0.01);
		},
	};
}
