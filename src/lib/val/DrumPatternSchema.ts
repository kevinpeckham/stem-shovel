import * as v from "valibot";
import {
	DRUM_BPM_MAX,
	DRUM_BPM_MIN,
	DRUM_KIT_IDS,
	DRUM_STEP_CHOICES,
	DRUM_VELOCITY_MAX,
	DRUM_VOICE_IDS,
	MAX_DRUM_ROWS,
} from "$lib/constants/drumMachine";

/**
 * A drum pattern (docs/drum-machine.md): what the page keeps in
 * localStorage and what a share link carries, so both are checked against
 * this before use. Solo is not part of it: that is a listening choice, not
 * the beat.
 */
export const DrumRowSchema = v.object({
	voice: v.picklist(DRUM_VOICE_IDS),
	/** 0 silent to 1 full; the slider's position, squared into a gain. */
	level: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
	mute: v.boolean(),
	/** One velocity per step, 0 to DRUM_VELOCITY_MAX. */
	cells: v.array(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(DRUM_VELOCITY_MAX))),
});
export type DrumRow = v.InferOutput<typeof DrumRowSchema>;

export const DrumPatternSchema = v.object({
	v: v.literal(1),
	bpm: v.pipe(v.number(), v.integer(), v.minValue(DRUM_BPM_MIN), v.maxValue(DRUM_BPM_MAX)),
	/** 0 straight to 1 full: the off-sixteenths land late by up to a third of a step. */
	swing: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
	steps: v.picklist(DRUM_STEP_CHOICES),
	kit: v.picklist(DRUM_KIT_IDS),
	rows: v.pipe(v.array(DrumRowSchema), v.minLength(1), v.maxLength(MAX_DRUM_ROWS)),
});
export type DrumPattern = v.InferOutput<typeof DrumPatternSchema>;
