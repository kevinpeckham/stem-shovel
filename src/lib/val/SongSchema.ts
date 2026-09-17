import * as v from "valibot";
import { NameSchema } from "./NameSchema";
import { NanoIdSchema } from "./NanoIdSchema";
import { SlugSchema } from "./SlugSchema";
import { SongDocKindSchema } from "./SongDocKindSchema";

/** "major.minor.patch", each a plain number. */
export const SongVersionSchema = v.pipe(
	v.string(),
	v.trim(),
	v.regex(/^\d+\.\d+\.\d+$/, "Versions look like 1.2.3."),
);

/** Argument of the setSongVersion command. */
export const SongVersionSetSchema = v.object({ id: NanoIdSchema, version: SongVersionSchema });

/** Form boundary for the song settings form (title, URL, description). */
export const SongSettingsSchema = v.object({
	id: NanoIdSchema,
	title: NameSchema,
	slug: SlugSchema,
	description: v.optional(
		v.pipe(v.string(), v.trim(), v.maxLength(2000, "Keep the description under 2000 characters.")),
		"",
	),
	songwriter: v.optional(
		v.pipe(v.string(), v.trim(), v.maxLength(200, "Keep the songwriter under 200 characters.")),
		"",
	),
	/** Start of bar 1 and the song's end, typed in any position format; the page converts to seconds. */
	startAt: v.optional(
		v.union([v.literal(""), v.pipe(v.string(), v.trim(), v.decimal("Not a time."))]),
		"",
	),
	endAt: v.optional(
		v.union([v.literal(""), v.pipe(v.string(), v.trim(), v.decimal("Not a time."))]),
		"",
	),
	/** Semantic version, user-managed: "1.2.3". */
	version: v.optional(SongVersionSchema, "0.0.1"),
	/** Frame rate for timecode, as a string from a select. */
	frameRate: v.optional(v.picklist(["23.976", "24", "25", "29.97", "30"]), "25"),
	/** "YYYY-MM-DD" from a date input, or empty. */
	writtenOn: v.optional(
		v.union(
			[v.literal(""), v.pipe(v.string(), v.isoDate("Enter the date as YYYY-MM-DD."))],
			"Enter the date as YYYY-MM-DD.",
		),
		"",
	),
});

export type SongSettings = v.InferOutput<typeof SongSettingsSchema>;

/** Form boundary for saving a song document (chart or lyrics). */
export const SongDocSaveSchema = v.object({
	songId: NanoIdSchema,
	kind: SongDocKindSchema,
	markdown: v.pipe(v.string(), v.maxLength(200_000)),
	/** "true" on the second submit of an intentionally empty document (hidden inputs carry strings). */
	confirmEmpty: v.optional(v.picklist(["true", "false"]), "false"),
});

export type SongDocSave = v.InferOutput<typeof SongDocSaveSchema>;

/** Form boundary for creating a song in a project. */
export const SongCreateSchema = v.object({ projectId: NanoIdSchema, title: NameSchema });

/** Form boundary for deleting a song, a stem or a demo by id. */
export const IdSchema = v.object({ id: NanoIdSchema });

/** The default mix a member saves: a fader per stem, 0..1.25 like the player's. */
export const DefaultMixSchema = v.object({
	id: NanoIdSchema,
	gains: v.pipe(
		v.array(
			v.object({
				id: NanoIdSchema,
				gain: v.pipe(v.number(), v.minValue(0), v.maxValue(1.25)),
			}),
		),
		v.minLength(1),
		v.maxLength(64),
	),
});

/** Several stems at once (the "Replace Stems" batch removes the ones without a new file). */
export const StemIdsSchema = v.object({
	ids: v.pipe(v.array(NanoIdSchema), v.minLength(1), v.maxLength(64)),
});

/** Argument of the renameStem command. */
export const StemRenameSchema = v.object({ id: NanoIdSchema, label: NameSchema });
