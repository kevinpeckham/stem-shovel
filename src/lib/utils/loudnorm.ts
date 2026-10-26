import { SESSION_LOUDNESS } from "#lib/constants/sessionLoudness.js";

/** What `loudnorm`'s first pass (`print_format=json`) measured, as the second pass wants it. */
export interface LoudnormMeasurement {
	inputI: number;
	inputTp: number;
	inputLra: number;
	inputThresh: number;
	targetOffset: number;
}

/**
 * The measurement block ffmpeg's `loudnorm` prints on stderr at the end of
 * a first pass with `print_format=json`: the last `{ … }` holding
 * `input_i` and the rest, every value a number in a string. Null when the
 * block is missing or any value is not a finite number (a file too short
 * or silent reads `-inf`), in which case the encode runs without leveling.
 */
export function parseLoudnorm(stderr: string): LoudnormMeasurement | null {
	const blocks = stderr.match(/\{[^{}]*"input_i"[^{}]*\}/g);
	const block = blocks?.at(-1);
	if (!block) return null;
	let v: Record<string, unknown>;
	try {
		v = JSON.parse(block) as Record<string, unknown>;
	} catch {
		return null;
	}
	const num = (k: string) => {
		const n = Number(v[k]);
		return Number.isFinite(n) ? n : null;
	};
	const [inputI, inputTp, inputLra, inputThresh, targetOffset] = [
		num("input_i"),
		num("input_tp"),
		num("input_lra"),
		num("input_thresh"),
		num("target_offset"),
	];
	if (
		inputI === null ||
		inputTp === null ||
		inputLra === null ||
		inputThresh === null ||
		targetOffset === null
	)
		return null;
	return { inputI, inputTp, inputLra, inputThresh, targetOffset };
}

const target = () =>
	`I=${SESSION_LOUDNESS.integrated}:TP=${SESSION_LOUDNESS.truePeak}:LRA=${SESSION_LOUDNESS.range}`;

/** The first pass: measure only, the numbers to stderr as JSON. */
export function loudnormMeasureFilter(): string {
	return `loudnorm=${target()}:print_format=json`;
}

/**
 * The second pass with the first's numbers: `linear=true` asks for one
 * gain across the whole file (the set's dynamics kept), which loudnorm
 * grants when the true peak allows and otherwise falls back to its
 * dynamic mode on its own.
 */
export function loudnormApplyFilter(m: LoudnormMeasurement): string {
	return (
		`loudnorm=${target()}:measured_I=${m.inputI}:measured_TP=${m.inputTp}` +
		`:measured_LRA=${m.inputLra}:measured_thresh=${m.inputThresh}:offset=${m.targetOffset}:linear=true`
	);
}

/**
 * For a set too long for the two passes (`LEVEL_MAX_SECONDS`): a limiter
 * at −1 dBFS and nothing else, so a capture at full scale still leaves
 * headroom for a phone's mono downmix. `level=false` keeps the gain as it
 * is; only peaks over the ceiling are caught.
 */
export function peakLimiterFilter(): string {
	return "alimiter=limit=0.891:level=false";
}
