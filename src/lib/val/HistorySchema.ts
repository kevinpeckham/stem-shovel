import * as v from "valibot";
import { NanoIdSchema } from "./NanoIdSchema";
import { SongDocSaveKindSchema } from "./SongDocKindSchema";

/**
 * Version history of the song page's texts (history.remote.ts): the shared
 * chart, lyrics and notes, the caller's private note ("mynotes") and the
 * comments. Each pairs the document with the revision to act on.
 */

/** Argument of the docHistory query: a song's document, by its save kind. */
export const DocHistorySchema = v.object({
	songId: NanoIdSchema,
	kind: SongDocSaveKindSchema,
});

export type DocHistory = v.InferOutput<typeof DocHistorySchema>;

/** Argument of the restoreDocVersion command: the revision to make current again. */
export const DocVersionRestoreSchema = v.object({
	songId: NanoIdSchema,
	kind: SongDocSaveKindSchema,
	versionId: NanoIdSchema,
});

export type DocVersionRestore = v.InferOutput<typeof DocVersionRestoreSchema>;

/** Argument of the commentHistory query. */
export const CommentHistorySchema = v.object({ commentId: NanoIdSchema });

export type CommentHistory = v.InferOutput<typeof CommentHistorySchema>;

/** Argument of the restoreCommentVersion command. */
export const CommentVersionRestoreSchema = v.object({
	commentId: NanoIdSchema,
	versionId: NanoIdSchema,
});

export type CommentVersionRestore = v.InferOutput<typeof CommentVersionRestoreSchema>;
