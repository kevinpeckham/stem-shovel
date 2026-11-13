import * as v from "valibot";
import {
	DRUM_BPM_MAX,
	DRUM_BPM_MIN,
	DEFAULT_DRUM_FX,
	DEFAULT_DRUM_SENDS,
	DRUM_DELAY_STEPS,
	DRUM_METER_IDS,
	DRUM_STEP_CHOICES,
	DRUM_SWING_GRIDS,
	DRUM_VOICE_IDS,
	DRUM_WAH_BAR_CHOICES,
	MAX_DRUM_PATTERNS,
	MAX_DRUM_TIMELINE,
	MAX_DRUM_ROWS,
} from "#lib/constants/expressionDrums.js";

/**
 * Expression drums cell: each step can have up to four independently toggled
 * hits — the main grid hit plus three off-grid subdivisions after it.
 * Each value is 0 (off) or a velocity layer 1-5.
 */
export const ExpressionCellSchema = v.object({
	/** The on-grid hit. */
	main: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(5)),
	/** First triplet after the step (1/3 of step duration). */
	t1: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(5)),
	/** Even split after the step (1/2 of step duration). */
	half: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(5)),
	/** Second triplet after the step (2/3 of step duration). */
	t2: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(5)),
});
export type ExpressionCell = v.InferOutput<typeof ExpressionCellSchema>;

/** A cell with everything off. */
export const EMPTY_CELL: ExpressionCell = { main: 0, t1: 0, half: 0, t2: 0 };

/** Whether a cell has any hit at all. */
export function cellActive(cell: ExpressionCell): boolean {
	return cell.main > 0 || cell.t1 > 0 || cell.half > 0 || cell.t2 > 0;
}

const ExpressionRowFieldsSchema = v.object({
	voice: v.picklist(DRUM_VOICE_IDS),
	level: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
	pan: v.pipe(v.number(), v.minValue(-1), v.maxValue(1)),
	mute: v.boolean(),
	delaySend: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1))),
	reverbSend: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1))),
	cells: v.array(ExpressionCellSchema),
});

export const ExpressionRowSchema = v.pipe(
	ExpressionRowFieldsSchema,
	v.transform((r) => ({
		...r,
		delaySend: r.delaySend ?? DEFAULT_DRUM_SENDS[r.voice].delaySend,
		reverbSend: r.reverbSend ?? DEFAULT_DRUM_SENDS[r.voice].reverbSend,
	})),
);
export type ExpressionRow = v.InferOutput<typeof ExpressionRowSchema>;

export const ExpressionPatternSchema = v.object({
	meter: v.optional(v.picklist(DRUM_METER_IDS), "4/4"),
	steps: v.picklist(DRUM_STEP_CHOICES),
	rows: v.pipe(v.array(ExpressionRowSchema), v.minLength(1), v.maxLength(MAX_DRUM_ROWS)),
});
export type ExpressionPattern = v.InferOutput<typeof ExpressionPatternSchema>;

export const ExpressionDrumFxSchema = v.object({
	delayTime: v.picklist(DRUM_DELAY_STEPS),
	delayFeedback: v.pipe(v.number(), v.minValue(0), v.maxValue(0.9)),
	delayReturn: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
	delayAnalog: v.optional(v.boolean(), false),
	reverbSize: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
	reverbReturn: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
	fuzzDrive: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1)), 0),
	fuzzTone: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1)), 0.5),
	wahBars: v.optional(v.picklist(DRUM_WAH_BAR_CHOICES), 1),
	wahRange: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1)), 0.7),
	wahResonance: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1)), 0.5),
	wahMix: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1)), 0),
	toneTilt: v.optional(v.pipe(v.number(), v.minValue(-1), v.maxValue(1)), 0),
	toneAir: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1)), 0),
	toneBottom: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1)), 0),
});
export type ExpressionDrumFx = v.InferOutput<typeof ExpressionDrumFxSchema>;

export const TimelineBarSchema = v.object({
	pattern: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(MAX_DRUM_PATTERNS - 1)),
	reps: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(99)),
});
export type TimelineBar = v.InferOutput<typeof TimelineBarSchema>;

export const ExpressionProjectSchema = v.object({
	v: v.picklist([1, 2]),
	bpm: v.pipe(v.number(), v.integer(), v.minValue(DRUM_BPM_MIN), v.maxValue(DRUM_BPM_MAX)),
	swing: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
	swingGrid: v.optional(v.picklist(DRUM_SWING_GRIDS), 16),
	humanize: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
	kit: v.pipe(v.string(), v.minLength(1), v.maxLength(40)),
	fx: v.optional(ExpressionDrumFxSchema, () => ({ ...DEFAULT_DRUM_FX })),
	patterns: v.pipe(v.array(ExpressionPatternSchema), v.minLength(1), v.maxLength(MAX_DRUM_PATTERNS)),
	timeline: v.optional(
		v.pipe(
			v.array(v.union([
				TimelineBarSchema,
				v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(MAX_DRUM_PATTERNS - 1)),
			])),
			v.maxLength(MAX_DRUM_TIMELINE),
		),
		() => [],
	),
});
export type ExpressionProject = v.InferOutput<typeof ExpressionProjectSchema>;
