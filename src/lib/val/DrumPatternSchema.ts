import * as v from "valibot";
import {
	DRUM_BPM_MAX,
	DRUM_BPM_MIN,
	DRUM_KIT_IDS,
	DRUM_STEP_CHOICES,
	DRUM_VELOCITY_MAX,
	DRUM_VOICE_IDS,
	MAX_DRUM_PATTERNS,
	MAX_DRUM_ROWS,
} from "$lib/constants/drumMachine";

/**
 * A drum project (docs/drum-machine.md): what the page keeps in
 * localStorage and what a share link carries, so both are checked against
 * this before use. A project is a tempo, swing, humanize and a kit over up
 * to eight patterns; a pattern is its steps and rows. Solo and which
 * pattern is open are not part of it: listening choices, not the beat.
 */
export const DrumRowSchema = v.object({
	voice: v.picklist(DRUM_VOICE_IDS),
	/** 0 silent to 1 full; the slider's position, squared into a gain. */
	level: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
	/** -1 left, 0 centre, 1 right. */
	pan: v.pipe(v.number(), v.minValue(-1), v.maxValue(1)),
	mute: v.boolean(),
	/** One velocity per step, 0 to DRUM_VELOCITY_MAX. */
	cells: v.array(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(DRUM_VELOCITY_MAX))),
});
export type DrumRow = v.InferOutput<typeof DrumRowSchema>;

export const DrumPatternSchema = v.object({
	steps: v.picklist(DRUM_STEP_CHOICES),
	rows: v.pipe(v.array(DrumRowSchema), v.minLength(1), v.maxLength(MAX_DRUM_ROWS)),
});
export type DrumPattern = v.InferOutput<typeof DrumPatternSchema>;

export const DrumProjectSchema = v.object({
	v: v.literal(2),
	bpm: v.pipe(v.number(), v.integer(), v.minValue(DRUM_BPM_MIN), v.maxValue(DRUM_BPM_MAX)),
	/** 0 straight to 1 full: the off-sixteenths land late by up to a third of a step. */
	swing: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
	/** 0 exact to 1: every hit scattered a little in time and level, so the pattern stops repeating itself exactly. */
	humanize: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
	kit: v.picklist(DRUM_KIT_IDS),
	patterns: v.pipe(v.array(DrumPatternSchema), v.minLength(1), v.maxLength(MAX_DRUM_PATTERNS)),
});
export type DrumProject = v.InferOutput<typeof DrumProjectSchema>;

/** What version 1 kept in localStorage: one pattern with the tempo inside it. Read only to upgrade. */
export const DrumProjectV1Schema = v.object({
	v: v.literal(1),
	bpm: v.pipe(v.number(), v.integer(), v.minValue(DRUM_BPM_MIN), v.maxValue(DRUM_BPM_MAX)),
	swing: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
	steps: v.picklist(DRUM_STEP_CHOICES),
	kit: v.picklist(DRUM_KIT_IDS),
	rows: v.pipe(v.array(v.omit(DrumRowSchema, ["pan"])), v.minLength(1), v.maxLength(MAX_DRUM_ROWS)),
});
export type DrumProjectV1 = v.InferOutput<typeof DrumProjectV1Schema>;
