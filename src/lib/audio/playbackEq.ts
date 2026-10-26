/**
 * The session player's playback EQ: an optional 80 Hz high-pass for rumble,
 * then a low shelf, a mid peak and a high shelf, each −12..+12 dB. The
 * high-pass is switched by crossfading two gains (through the filter, or
 * round it), so turning it off leaves the signal untouched rather than
 * filtered at a lower frequency. Changes glide with `setTargetAtTime`.
 */
export interface PlaybackEqSettings {
	highPass: boolean;
	/** Gains in dB, −12..+12. */
	low: number;
	mid: number;
	high: number;
}

export const DEFAULT_PLAYBACK_EQ: Readonly<PlaybackEqSettings> = Object.freeze({
	highPass: false,
	low: 0,
	mid: 0,
	high: 0,
});

export const PLAYBACK_EQ_MIN_DB = -12;
export const PLAYBACK_EQ_MAX_DB = 12;

/** Whether the settings leave the sound as it is (the defaults). */
export function isFlat(s: PlaybackEqSettings): boolean {
	return !s.highPass && s.low === 0 && s.mid === 0 && s.high === 0;
}

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
	highPass.frequency.value = 80;
	highPass.Q.value = 0.707;
	const through = ctx.createGain();
	const around = ctx.createGain();
	const low = ctx.createBiquadFilter();
	low.type = "lowshelf";
	low.frequency.value = 200;
	const mid = ctx.createBiquadFilter();
	mid.type = "peaking";
	mid.frequency.value = 1000;
	mid.Q.value = 1;
	const high = ctx.createBiquadFilter();
	high.type = "highshelf";
	high.frequency.value = 4000;

	input.connect(highPass).connect(through).connect(low);
	input.connect(around).connect(low);
	low.connect(mid).connect(high);

	// The starting values are set outright: nothing is playing yet to glide from.
	through.gain.value = settings.highPass ? 1 : 0;
	around.gain.value = settings.highPass ? 0 : 1;
	low.gain.value = settings.low;
	mid.gain.value = settings.mid;
	high.gain.value = settings.high;

	return {
		input,
		output: high,
		update(s) {
			const t = ctx.currentTime;
			through.gain.setTargetAtTime(s.highPass ? 1 : 0, t, TAU);
			around.gain.setTargetAtTime(s.highPass ? 0 : 1, t, TAU);
			low.gain.setTargetAtTime(s.low, t, TAU);
			mid.gain.setTargetAtTime(s.mid, t, TAU);
			high.gain.setTargetAtTime(s.high, t, TAU);
		},
	};
}
