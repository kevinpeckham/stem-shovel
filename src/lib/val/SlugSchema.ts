import * as v from "valibot";

/**
 * URL segment for projects and songs: lowercase letters and digits joined by
 * single hyphens, up to 64 chars. `slugify()` in $lib/slug produces these;
 * this is the check for hand-edited ones at the form boundary.
 */
export const SlugSchema = v.pipe(
	v.string(),
	v.trim(),
	v.toLowerCase(),
	v.nonEmpty("A URL is required."),
	v.slug("Lowercase letters, digits and single hyphens only."),
	v.maxLength(64, "Keep the URL under 64 characters."),
);

export type Slug = v.InferOutput<typeof SlugSchema>;
