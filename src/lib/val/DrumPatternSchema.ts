import * as v from "valibot";
import {
	DRUM_BPM_MAX,
	DRUM_BPM_MIN,
	DEFAULT_DRUM_FX,
	DEFAULT_DRUM_SENDS,
	DRUM_DELAY_STEPS,
	DRUM_KIT_IDS,
	DRUM_METER_IDS,
	DRUM_STEP_CHOICES,
	DRUM_STEP_CHOICES_V2,
	DRUM_SWING_GRIDS,
	DRUM_VELOCITY_MAX,
	DRUM_VOICE_IDS,
	MAX_DRUM_PATTERNS,
	MAX_DRUM_TIMELINE,
	MAX_DRUM_ROWS,
} from "$lib/constants/drumMachine";

/**
 * A drum project (docs/drum-machine.md): what the page keeps in
 * localStorage and what a share link carries, so both are checked against
 * this before use. A project is a tempo, swing, humanize and a kit over up
 * to eight patterns; a pattern is its steps and rows. Solo and which
 * pattern is open are not part of it: listening choices, not the beat.
 */
const DrumRowFieldsSchema = v.object({
	voice: v.picklist(DRUM_VOICE_IDS),
	/** 0 silent to 1 full; the slider's position, squared into a gain. */
	level: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
	/** -1 left, 0 centre, 1 right. */
	pan: v.pipe(v.number(), v.minValue(-1), v.maxValue(1)),
	mute: v.boolean(),
	/** How much of the row goes to the delay and the reverb, 0 to 1, on top of the dry signal. Absent in rows stored before the effects existed: see DrumRowSchema. */
	delaySend: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1))),
	reverbSend: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1))),
	/** One velocity per step, 0 to DRUM_VELOCITY_MAX. */
	cells: v.array(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(DRUM_VELOCITY_MAX))),
});
/** A row stored before the effects existed (a beat or link from before v0.49.0) gets its voice's usual sends, so the first master level someone raises is heard, as in a new beat. */
export const DrumRowSchema = v.pipe(
	DrumRowFieldsSchema,
	v.transform((r) => ({
		...r,
		delaySend: r.delaySend ?? DEFAULT_DRUM_SENDS[r.voice].delaySend,
		reverbSend: r.reverbSend ?? DEFAULT_DRUM_SENDS[r.voice].reverbSend,
	})),
);
export type DrumRow = v.InferOutput<typeof DrumRowSchema>;

/**
 * The project's effects: the delay's time (sixteenths), feedback, return
 * and analog character, the reverb's size and return, the fuzz's drive and
 * tone. A beat or link stored before the analog delay and the fuzz existed
 * (v0.61.0) gets them off.
 */
export const DrumFxSchema = v.object({
	delayTime: v.picklist(DRUM_DELAY_STEPS),
	delayFeedback: v.pipe(v.number(), v.minValue(0), v.maxValue(0.9)),
	delayReturn: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
	delayAnalog: v.optional(v.boolean(), false),
	reverbSize: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
	reverbReturn: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
	fuzzDrive: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1)), 0),
	fuzzTone: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1)), 0.5),
});
export type DrumFx = v.InferOutput<typeof DrumFxSchema>;

export const DrumPatternSchema = v.object({
	/** How the bar reads (shading, MIDI); a project stored before meters existed is 4/4. */
	meter: v.optional(v.picklist(DRUM_METER_IDS), "4/4"),
	steps: v.picklist(DRUM_STEP_CHOICES),
	rows: v.pipe(v.array(DrumRowSchema), v.minLength(1), v.maxLength(MAX_DRUM_ROWS)),
});
export type DrumPattern = v.InferOutput<typeof DrumPatternSchema>;

export const DrumProjectSchema = v.object({
	v: v.literal(2),
	bpm: v.pipe(v.number(), v.integer(), v.minValue(DRUM_BPM_MIN), v.maxValue(DRUM_BPM_MAX)),
	/** 0 straight to 1 full: the swung steps land late by up to a third of the grid's step. */
	swing: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
	/** 16: every second sixteenth swings; 8: the off-beat eighths. Projects stored before the choice existed are 16. */
	swingGrid: v.optional(v.picklist(DRUM_SWING_GRIDS), 16),
	/** 0 exact to 1: every hit scattered a little in time and level, so the pattern stops repeating itself exactly. */
	humanize: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
	kit: v.picklist(DRUM_KIT_IDS),
	/** Projects stored before the effects existed get the defaults (and their rows send nothing). */
	fx: v.optional(DrumFxSchema, () => ({ ...DEFAULT_DRUM_FX })),
	patterns: v.pipe(v.array(DrumPatternSchema), v.minLength(1), v.maxLength(MAX_DRUM_PATTERNS)),
	/** The song: patterns by index, a bar each, played in order in song mode. Empty (and projects stored before it existed) means loop the open pattern. An index past the last pattern plays the last. */
	timeline: v.optional(
		v.pipe(
			v.array(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(MAX_DRUM_PATTERNS - 1))),
			v.maxLength(MAX_DRUM_TIMELINE),
		),
		() => [],
	),
});
export type DrumProject = v.InferOutput<typeof DrumProjectSchema>;

/** What version 1 kept in localStorage: one pattern with the tempo inside it. Read only to upgrade. */
export const DrumProjectV1Schema = v.object({
	v: v.literal(1),
	bpm: v.pipe(v.number(), v.integer(), v.minValue(DRUM_BPM_MIN), v.maxValue(DRUM_BPM_MAX)),
	swing: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
	steps: v.picklist(DRUM_STEP_CHOICES_V2),
	kit: v.picklist(DRUM_KIT_IDS),
	rows: v.pipe(
		v.array(v.omit(DrumRowFieldsSchema, ["pan", "delaySend", "reverbSend"])),
		v.minLength(1),
		v.maxLength(MAX_DRUM_ROWS),
	),
});
export type DrumProjectV1 = v.InferOutput<typeof DrumProjectV1Schema>;
