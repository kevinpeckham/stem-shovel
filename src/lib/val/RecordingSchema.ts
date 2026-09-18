import * as v from "valibot";
import { NameSchema } from "./NameSchema";
import { NanoIdSchema } from "./NanoIdSchema";

/** Argument of the addRecordingToSong command: the take, the song it becomes a demo of, and whether the idea's notes join the song's. */
export const RecordingToSongSchema = v.object({
	id: NanoIdSchema,
	songId: NanoIdSchema,
	mergeNotes: v.optional(v.boolean(), true),
});

/** Argument of the newSongFromRecording command: a new song in the project, with the take as its first demo. */
export const RecordingToNewSongSchema = v.object({
	id: NanoIdSchema,
	projectId: NanoIdSchema,
	title: NameSchema,
	mergeNotes: v.optional(v.boolean(), true),
});

export type RecordingToSong = v.InferOutput<typeof RecordingToSongSchema>;
export type RecordingToNewSong = v.InferOutput<typeof RecordingToNewSongSchema>;
