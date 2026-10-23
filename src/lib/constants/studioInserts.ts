/**
 * Dawn's inserts (docs/dawn-daw-plan.md, D2): the effects a track, a bus
 * or the master can carry in a list, each a kind with its settings, its
 * parameters described once here for the panel's sliders and the
 * automation lanes (a parameter is automatable when the stage exposes it
 * as an AudioParam, `insertChain.ts`).
 */
export const INSERT_KINDS = ["eq", "compressor", "tone", "delay", "reverb", "limiter"] as const;
export type InsertKind = (typeof INSERT_KINDS)[number];

export const INSERT_LABELS: Record<InsertKind, string> = {
	eq: "EQ",
	compressor: "Compressor",
	tone: "Tone",
	delay: "Delay",
	reverb: "Reverb",
	limiter: "Limiter",
};

/** One parameter of an insert, as the panel and a lane see it. */
export interface InsertParam {
	key: string;
	label: string;
	min: number;
	max: number;
	step: number;
	format: (v: number) => string;
	/** The lane's arc fills from the center (a gain in dB around zero). */
	bipolar?: boolean;
	/** The stage exposes it as an AudioParam: a lane can drive it. */
	automatable?: boolean;
}

const dB = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`;
const hz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} kHz` : `${Math.round(v)} Hz`);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const ms = (v: number) => `${Math.round(v * 1000)} ms`;

export const INSERT_PARAMS: Record<InsertKind, InsertParam[]> = {
	eq: [
		{
			key: "lowGain",
			label: "Low",
			min: -12,
			max: 12,
			step: 0.5,
			format: dB,
			bipolar: true,
			automatable: true,
		},
		{ key: "lowFreq", label: "Low freq", min: 40, max: 500, step: 5, format: hz },
		{
			key: "midGain",
			label: "Mid",
			min: -12,
			max: 12,
			step: 0.5,
			format: dB,
			bipolar: true,
			automatable: true,
		},
		{
			key: "midFreq",
			label: "Mid freq",
			min: 200,
			max: 8000,
			step: 10,
			format: hz,
			automatable: true,
		},
		{
			key: "midQ",
			label: "Mid width",
			min: 0.3,
			max: 6,
			step: 0.1,
			format: (v) => `Q ${v.toFixed(1)}`,
		},
		{
			key: "highGain",
			label: "High",
			min: -12,
			max: 12,
			step: 0.5,
			format: dB,
			bipolar: true,
			automatable: true,
		},
		{ key: "highFreq", label: "High freq", min: 2000, max: 16000, step: 100, format: hz },
	],
	compressor: [
		{ key: "amount", label: "Amount", min: 0, max: 1, step: 0.01, format: pct },
		{ key: "ratio", label: "Ratio", min: 1, max: 20, step: 1, format: (v) => `${v}:1` },
		{ key: "attack", label: "Attack", min: 0.001, max: 1, step: 0.001, format: ms },
		{ key: "release", label: "Release", min: 0.01, max: 2, step: 0.01, format: ms },
		{ key: "makeup", label: "Make-up", min: 0, max: 24, step: 1, format: dB },
	],
	tone: [
		{
			key: "tilt",
			label: "Tilt",
			min: -1,
			max: 1,
			step: 0.05,
			format: (v) => (v < 0 ? "dark" : v > 0 ? "bright" : "flat"),
			bipolar: true,
		},
		{ key: "air", label: "Air", min: 0, max: 1, step: 0.05, format: pct },
		{ key: "bottom", label: "Bottom", min: 0, max: 1, step: 0.05, format: pct },
	],
	delay: [
		{ key: "time", label: "Time", min: 0.02, max: 2, step: 0.01, format: ms },
		{
			key: "feedback",
			label: "Feedback",
			min: 0,
			max: 0.9,
			step: 0.01,
			format: pct,
			automatable: true,
		},
		{ key: "level", label: "Level", min: 0, max: 1, step: 0.01, format: pct, automatable: true },
	],
	reverb: [
		{ key: "level", label: "Level", min: 0, max: 1, step: 0.01, format: pct, automatable: true },
		{
			key: "size",
			label: "Size",
			min: 0,
			max: 1,
			step: 0.05,
			format: (v) => (v < 0.34 ? "a room" : v < 0.67 ? "a hall" : "a cathedral"),
		},
	],
	limiter: [
		{ key: "ceiling", label: "Ceiling", min: -12, max: 0, step: 0.5, format: dB },
		{ key: "release", label: "Release", min: 0.01, max: 1, step: 0.01, format: ms },
	],
};

/** A new insert's settings. */
export const INSERT_DEFAULTS: Record<InsertKind, Record<string, number | boolean>> = {
	eq: { lowGain: 0, lowFreq: 120, midGain: 0, midFreq: 1000, midQ: 1, highGain: 0, highFreq: 6000 },
	compressor: { amount: 0.4, ratio: 4, attack: 0.01, release: 0.25, makeup: 0 },
	tone: { tilt: 0, air: 0, bottom: 0 },
	delay: { time: 0.375, feedback: 0.35, level: 0.3, analog: true },
	reverb: { level: 0.3, size: 0.5 },
	limiter: { ceiling: -1, release: 0.1 },
};

/** Inserts a track, a bus or the master may carry. */
export const MAX_INSERTS = 8;
/** Buses a song may have, groups included (docs/multitrack-recorder.md "Folder tracks"): half the tracks, a group or a return for every pair. */
export const MAX_STUDIO_BUSES = 32;
/** Sends a track may have (one per bus at most). */
export const MAX_SENDS = MAX_STUDIO_BUSES;

/** The lane key of an insert's parameter, and of a send (docs/dawn-daw-plan.md, D2). */
export const insertLaneKey = (insertId: string, param: string) => `insert:${insertId}:${param}`;
export const sendLaneKey = (busId: string) => `send:${busId}`;
