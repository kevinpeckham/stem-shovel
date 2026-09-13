import { SONG_CHANGE_KINDS } from "$lib/constants/songChanges";
import { songChangeValueError } from "$lib/utils/songChangeValueError";
import * as v from "valibot";

export const SongChangeKindSchema = v.picklist(SONG_CHANGE_KINDS);

/**
 * One change: the kind, where it starts (seconds) and its value as text —
 * "120" or "87.5" for tempo, "F#m" for key, "6/8" for time signature.
 */
export const SongChangeSchema = v.pipe(
	v.object({
		kind: SongChangeKindSchema,
		start: v.pipe(v.number(), v.minValue(0, "A change cannot start before 0:00.")),
		value: v.pipe(v.string(), v.trim(), v.maxLength(20)),
	}),
	v.check(
		(c) => songChangeValueError(c.kind, c.value) === null,
		"Invalid value for this kind of change.",
	),
);

export type SongChange = v.InferOutput<typeof SongChangeSchema>;

export const MAX_SONG_CHANGES = 96;

export const SongChangesSchema = v.pipe(
	v.array(SongChangeSchema),
	v.maxLength(MAX_SONG_CHANGES, `At most ${MAX_SONG_CHANGES} changes.`),
);

/** Argument of the saveChanges command. */
export const SongChangesSaveSchema = v.object({
	id: v.pipe(v.string(), v.minLength(1)),
	changes: SongChangesSchema,
});
