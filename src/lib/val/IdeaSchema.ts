import * as v from "valibot";
import { DrumProjectSchema } from "./DrumPatternSchema";
import { NameSchema } from "./NameSchema";
import { NanoIdSchema } from "./NanoIdSchema";
import { PianoPresetDataSchema } from "./PianoPresetSchema";

/** Argument of the createIdea command: the idea's title (the recorder prefills "Untitled - <date> - <time>"). */
export const IdeaCreateSchema = v.object({ title: NameSchema });

/** Argument of the renameIdea command. */
export const IdeaRenameSchema = v.object({ id: NanoIdSchema, title: NameSchema });

/** Argument of the saveIdeaNotes command: the idea's markdown note board. */
export const IdeaNotesSchema = v.object({
	id: NanoIdSchema,
	markdown: v.pipe(v.string(), v.maxLength(50_000, "Keep the notes under 50,000 characters.")),
});

/** What the idea keeps of a loop saved as a take (docs/looper.md): enough to show how it was made; the audio is the take and its sources. */
export const LooperSettingsSchema = v.object({
	bpm: v.pipe(v.number(), v.integer(), v.minValue(40), v.maxValue(240)),
	beatsPerBar: v.picklist([3, 4]),
	bars: v.picklist([1, 2, 4, 8]),
	layers: v.pipe(
		v.array(
			v.object({
				label: v.pipe(v.string(), v.maxLength(60)),
				source: v.picklist(["mic", "piano", "drums"]),
				gain: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
				muted: v.boolean(),
			}),
		),
		v.maxLength(16),
	),
});
export type LooperSettings = v.InferOutput<typeof LooperSettingsSchema>;

/** What the idea keeps of its instruments (the `idea.instruments` column, JSON): the drum machine's whole project and the piano's sound and effects (its preset shape), either null until that instrument was used with the idea. */
export const IdeaInstrumentsDataSchema = v.object({
	drums: v.nullable(DrumProjectSchema),
	piano: v.nullable(PianoPresetDataSchema),
	/** A loop saved from the looper (docs/looper.md): its tempo, length and layers; null on takes from the recorder. */
	looper: v.optional(v.nullable(LooperSettingsSchema), null),
});

/** Argument of the saveIdeaInstruments command. */
export const IdeaInstrumentsSchema = v.object({
	id: NanoIdSchema,
	...IdeaInstrumentsDataSchema.entries,
});

/** Argument of the setTakeName command: a take's optional name ("" clears it, "Take N" shows). */
export const TakeNameSchema = v.object({
	id: NanoIdSchema,
	title: v.pipe(v.string(), v.trim(), v.maxLength(120, "Keep it under 120 characters.")),
});

export type IdeaCreate = v.InferOutput<typeof IdeaCreateSchema>;
export type IdeaRename = v.InferOutput<typeof IdeaRenameSchema>;
export type IdeaNotes = v.InferOutput<typeof IdeaNotesSchema>;
export type TakeName = v.InferOutput<typeof TakeNameSchema>;
export type IdeaInstruments = v.InferOutput<typeof IdeaInstrumentsDataSchema>;
