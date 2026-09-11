// Archive lifecycle shared by projects and songs.
import * as v from "valibot";

export const ARCHIVE_STATUSES = ["active", "archived"] as const;

export const ArchiveStatusSchema = v.picklist(ARCHIVE_STATUSES);

export type ArchiveStatus = v.InferOutput<typeof ArchiveStatusSchema>;
