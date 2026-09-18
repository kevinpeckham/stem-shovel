import * as v from "valibot";
import { NameSchema } from "./NameSchema";
import { NanoIdSchema } from "./NanoIdSchema";

/** Argument of the addRecordingToSong command: the recording and the song it becomes a demo of. */
export const RecordingToSongSchema = v.object({ id: NanoIdSchema, songId: NanoIdSchema });

/** Argument of the newSongFromRecording command: a new song in the project, with the recording as its first demo. */
export const RecordingToNewSongSchema = v.object({
	id: NanoIdSchema,
	projectId: NanoIdSchema,
	title: NameSchema,
});

export type RecordingToSong = v.InferOutput<typeof RecordingToSongSchema>;
export type RecordingToNewSong = v.InferOutput<typeof RecordingToNewSongSchema>;
