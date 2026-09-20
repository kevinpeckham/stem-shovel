import type { ProjectType } from "$lib/val/ProjectTypeSchema";

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
	album: "Album",
	ep: "EP",
	single: "Single",
	soundtrack: "Soundtrack",
	compilation: "Compilation",
	demos: "Demos",
	other: "Other",
};

/** Beyond this many distinct performers a project reads "Various artists" (the names in a title). */
export const VARIOUS_ARTISTS_FROM = 4;
