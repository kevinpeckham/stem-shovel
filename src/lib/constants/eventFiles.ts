import type { FileKind } from "./fileFormats";

/**
 * The files of a show or practice (docs/band-plan.md, "Posters, pictures and
 * video"): one poster, a gallery of photos. Video comes later. The size
 * ceilings are the attachments' (`FILE_MAX_BYTES` by the file's kind).
 */
export const EVENT_FILE_KINDS = ["poster", "photo"] as const;
export type EventFileKind = (typeof EVENT_FILE_KINDS)[number];

/** How many photos one event may carry. */
export const MAX_EVENT_PHOTOS = 200;

/** The kinds of file (by extension) a poster may be: a PDF for printing or an image. */
export const EVENT_POSTER_FILE_KINDS = ["pdf", "image"] as const satisfies readonly FileKind[];
/** A photo is an image. */
export const EVENT_PHOTO_FILE_KINDS = ["image"] as const satisfies readonly FileKind[];
