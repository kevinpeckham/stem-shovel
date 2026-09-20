import * as v from "valibot";

/** A solo artist (one person: the record carries their email) or a band, duo, collective (the people are listed under it). */
export const ARTIST_KINDS = ["person", "group"] as const;
export const ArtistKindSchema = v.picklist(ARTIST_KINDS);
export type ArtistKind = v.InferOutput<typeof ArtistKindSchema>;
