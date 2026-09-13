import * as v from "valibot";

/** One song section: a name and where it starts, in seconds. */
export const SongSectionSchema = v.object({
	name: v.pipe(
		v.string(),
		v.trim(),
		v.minLength(1, "Give the section a name."),
		v.maxLength(40, "Keep section names under 40 characters."),
	),
	start: v.pipe(v.number(), v.minValue(0, "A section cannot start before 0:00.")),
});

export type SongSection = v.InferOutput<typeof SongSectionSchema>;

export const MAX_SONG_SECTIONS = 64;

/** The whole list, as saved: the server sorts by start and refuses duplicate starts. */
export const SongSectionsSchema = v.pipe(
	v.array(SongSectionSchema),
	v.maxLength(MAX_SONG_SECTIONS, `At most ${MAX_SONG_SECTIONS} sections.`),
);

/** Argument of the saveSections command. */
export const SongSectionsSaveSchema = v.object({
	id: v.pipe(v.string(), v.minLength(1)),
	sections: SongSectionsSchema,
});
