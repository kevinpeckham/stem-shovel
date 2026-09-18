import * as v from "valibot";
import { NameSchema } from "./NameSchema";
import { NanoIdSchema } from "./NanoIdSchema";

/** A scratch recording's title (the recorder's default is "Recording <date>"). */
export const RecordingTitleSchema = NameSchema;

/** Form boundary for renaming a recording in the library. */
export const RecordingRenameSchema = v.object({ id: NanoIdSchema, title: RecordingTitleSchema });

/** Argument of the addRecordingToSong command: the recording and the song it becomes a demo of. */
export const RecordingToSongSchema = v.object({ id: NanoIdSchema, songId: NanoIdSchema });

/** Argument of the newSongFromRecording command: a new song in the project, with the recording as its first demo. */
export const RecordingToNewSongSchema = v.object({
	id: NanoIdSchema,
	projectId: NanoIdSchema,
	title: NameSchema,
});

/** Argument of the saveRecordingNotes command: the recording's markdown notes. */
export const RecordingNotesSchema = v.object({
	id: NanoIdSchema,
	markdown: v.pipe(v.string(), v.maxLength(50_000, "Keep the notes under 50,000 characters.")),
});

export type RecordingRename = v.InferOutput<typeof RecordingRenameSchema>;
export type RecordingNotes = v.InferOutput<typeof RecordingNotesSchema>;
export type RecordingToSong = v.InferOutput<typeof RecordingToSongSchema>;
export type RecordingToNewSong = v.InferOutput<typeof RecordingToNewSongSchema>;
