import * as v from "valibot";

/** The markdown documents a song carries. Same editor, same versioning. */
export const SONG_DOC_KINDS = ["chart", "lyrics", "notes"] as const;

export const SongDocKindSchema = v.picklist(SONG_DOC_KINDS);

export type SongDocKind = v.InferOutput<typeof SongDocKindSchema>;

/**
 * What the `saveDoc` form accepts: the shared documents, plus "mynotes", the
 * caller's private note on the song (song_user_note), which any signed-in
 * person who may view the song keeps for themselves.
 */
export const MY_NOTES_KIND = "mynotes";
export const SONG_DOC_SAVE_KINDS = [...SONG_DOC_KINDS, MY_NOTES_KIND] as const;

export const SongDocSaveKindSchema = v.picklist(SONG_DOC_SAVE_KINDS);

export type SongDocSaveKind = v.InferOutput<typeof SongDocSaveKindSchema>;
