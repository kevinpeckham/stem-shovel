import * as v from "valibot";
import { NanoIdSchema } from "./NanoIdSchema";
import { SlugSchema } from "./SlugSchema";
import { UserDocKindSchema } from "./UserDocKindSchema";

const TitleSchema = v.pipe(
	v.string(),
	v.trim(),
	v.nonEmpty("Give the page a title."),
	v.maxLength(120, "Keep the title under 120 characters."),
);

/** New page or post: the slug comes from the title. */
export const UserDocCreateSchema = v.object({
	title: TitleSchema,
	kind: v.optional(UserDocKindSchema, "doc"),
});

/** Title, address and order of an existing page. */
export const UserDocMetaSchema = v.object({
	id: NanoIdSchema,
	title: TitleSchema,
	slug: SlugSchema,
	sortOrder: v.optional(
		v.pipe(
			v.string(),
			v.trim(),
			v.transform((s) => (s === "" ? 0 : Number(s))),
			v.number("Order must be a whole number."),
			v.integer("Order must be a whole number."),
		),
		"0",
	),
	/** Posts only (a checkbox): published shows the post to everyone. */
	published: v.optional(v.boolean(), false),
});

/** The editor's save, as for song documents (hidden inputs carry strings). */
export const UserDocSaveSchema = v.object({
	id: NanoIdSchema,
	markdown: v.pipe(v.string(), v.maxLength(200_000)),
	confirmEmpty: v.optional(v.picklist(["true", "false"]), "false"),
});

export type UserDocMeta = v.InferOutput<typeof UserDocMetaSchema>;
