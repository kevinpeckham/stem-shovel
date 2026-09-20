import * as v from "valibot";

/** What kind of release or collection a project is; "other" says nothing and shows no label. */
export const PROJECT_TYPES = [
	"album",
	"ep",
	"single",
	"soundtrack",
	"compilation",
	"demos",
	"other",
] as const;
export const ProjectTypeSchema = v.picklist(PROJECT_TYPES);
export type ProjectType = v.InferOutput<typeof ProjectTypeSchema>;
