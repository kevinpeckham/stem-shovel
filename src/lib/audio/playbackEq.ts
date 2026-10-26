import {
	EQ_BAND_SPECS,
	EQ_BANDS,
	EQ_HIGH_PASS_HZ,
	EQ_PEAK_Q,
	type EqBand,
} from "#lib/constants/playbackEq.js";
import { eqHeadroomDb } from "#lib/utils/eqHeadroomDb.js";
import { isFlatEq } from "#lib/utils/normalizePlaybackEq.js";
import { DEFAULT_PLAYBACK_EQ, type PlaybackEqSettings } from "#lib/val/PlaybackEqSchema.js";

/**
 * The session player's playback EQ as a Web Audio graph: an optional
 * high-pass for rumble, then the five bands of `constants/playbackEq.ts`
 * (a low shelf, three peaks, a high shelf), each with a gain and a center
 * the user moves. The high-pass is switched by crossfading two gains
 * (through the filter, or round it), so turning it off leaves the signal
 * untouched rather than filtered at a lower frequency. A trim after the
 * bands takes off the largest boost (`utils/eqHeadroomDb.ts`), so boosting
 * never pushes a leveled recording over full scale. Changes glide with
 * `setTargetAtTime`.
 */
export type { PlaybackEqSettings } from "#lib/val/PlaybackEqSchema.js";
export { DEFAULT_PLAYBACK_EQ } from "#lib/val/PlaybackEqSchema.js";

/** Whether the settings leave the sound as it is. */
export const isFlat = isFlatEq;

const TAU = 0.02;

export interface PlaybackEq {
	input: AudioNode;
	output: AudioNode;
	update(settings: PlaybackEqSettings): void;
}

export function createPlaybackEq(
	ctx: BaseAudioContext,
	settings: PlaybackEqSettings = DEFAULT_PLAYBACK_EQ,
): PlaybackEq {
	const input = ctx.createGain();
	const highPass = ctx.createBiquadFilter();
	highPass.type = "highpass";
	highPass.frequency.value = EQ_HIGH_PASS_HZ;
	highPass.Q.value = 0.707;
	const through = ctx.createGain();
	const around = ctx.createGain();
	const bands = {} as Record<EqBand, BiquadFilterNode>;
	for (const name of EQ_BANDS) {
		const f = ctx.createBiquadFilter();
		f.type = EQ_BAND_SPECS[name].kind;
		if (f.type === "peaking") f.Q.value = EQ_PEAK_Q;
		bands[name] = f;
	}

	input.connect(highPass).connect(through).connect(bands.low);
	input.connect(around).connect(bands.low);
	let last: AudioNode = bands.low;
	for (const name of EQ_BANDS.slice(1)) last = last.connect(bands[name]);
	const trim = ctx.createGain();
	last.connect(trim);

	// The starting values are set outright: nothing is playing yet to glide from.
	through.gain.value = settings.highPass ? 1 : 0;
	around.gain.value = settings.highPass ? 0 : 1;
	for (const name of EQ_BANDS) {
		bands[name].gain.value = settings[name].gain;
		bands[name].frequency.value = settings[name].freq;
	}
	trim.gain.value = trimGain(settings);

	return {
		input,
		output: trim,
		update(s) {
			const t = ctx.currentTime;
			through.gain.setTargetAtTime(s.highPass ? 1 : 0, t, TAU);
			around.gain.setTargetAtTime(s.highPass ? 0 : 1, t, TAU);
			for (const name of EQ_BANDS) {
				bands[name].gain.setTargetAtTime(s[name].gain, t, TAU);
				bands[name].frequency.setTargetAtTime(s[name].freq, t, TAU);
			}
			trim.gain.setTargetAtTime(trimGain(s), t, TAU);
		},
	};
}

/** The trim as a linear gain: the largest boost taken off, 1 when nothing is boosted. */
function trimGain(s: PlaybackEqSettings): number {
	return 10 ** (-eqHeadroomDb(s) / 20);
}
