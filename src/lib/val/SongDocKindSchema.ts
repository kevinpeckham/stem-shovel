import * as v from "valibot";

/** The markdown documents a song carries. Same editor, same versioning. */
export const SONG_DOC_KINDS = ["chart", "lyrics"] as const;

export const SongDocKindSchema = v.picklist(SONG_DOC_KINDS);

export type SongDocKind = v.InferOutput<typeof SongDocKindSchema>;
