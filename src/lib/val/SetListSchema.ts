import * as v from "valibot";
import { NanoIdSchema } from "./NanoIdSchema";

/** How many rows a set list may hold: three sets and an encore of a long night, with room. */
export const MAX_SET_LIST_ITEMS = 200;
/** How many set lists an account may keep. */
export const MAX_SET_LISTS_PER_ACCOUNT = 500;

const TitleSchema = v.pipe(
	v.string(),
	v.trim(),
	v.minLength(1, "Give the set list a title."),
	v.maxLength(120, "Keep the title under 120 characters."),
);
const NotesSchema = v.pipe(
	v.string(),
	v.trim(),
	v.maxLength(4000, "Keep the notes under 4,000 characters."),
);
/** A row's words: a free-text row's title (a cover, "break", "encore"), or the note beside a song. */
const ItemTitleSchema = v.pipe(
	v.string(),
	v.trim(),
	v.maxLength(120, "Keep it under 120 characters."),
);
const ItemNoteSchema = v.pipe(
	v.string(),
	v.trim(),
	v.maxLength(200, "Keep the note under 200 characters."),
);

/** A new set list (docs/band-plan.md, phase 1): its account, title and notes. */
export const SetListCreateSchema = v.object({
	accountId: NanoIdSchema,
	title: TitleSchema,
	notes: v.optional(NotesSchema, ""),
});
export type SetListCreate = v.InferOutput<typeof SetListCreateSchema>;

export const SetListUpdateSchema = v.object({
	id: NanoIdSchema,
	title: TitleSchema,
	notes: v.optional(NotesSchema, ""),
});
export type SetListUpdate = v.InferOutput<typeof SetListUpdateSchema>;

export const SetListIdSchema = v.object({ id: NanoIdSchema });
export type SetListId = v.InferOutput<typeof SetListIdSchema>;

/** A row to add at the end: a song of the account (`songId`) or free text (`title`); one of the two. */
export const SetListItemAddSchema = v.pipe(
	v.object({
		setListId: NanoIdSchema,
		songId: v.optional(v.pipe(v.string(), v.trim()), ""),
		title: v.optional(ItemTitleSchema, ""),
		note: v.optional(ItemNoteSchema, ""),
	}),
	v.check((o) => (o.songId !== "") !== (o.title !== ""), "Pick a song or type a title."),
);
export type SetListItemAdd = v.InferOutput<typeof SetListItemAddSchema>;

/** A row's words changed: a free-text row's title (ignored for a song row) and the note. */
export const SetListItemUpdateSchema = v.object({
	id: NanoIdSchema,
	title: v.optional(ItemTitleSchema, ""),
	note: v.optional(ItemNoteSchema, ""),
});
export type SetListItemUpdate = v.InferOutput<typeof SetListItemUpdateSchema>;

export const SetListItemIdSchema = v.object({ id: NanoIdSchema });
export type SetListItemId = v.InferOutput<typeof SetListItemIdSchema>;

/** The rows in their new order: every row of the set list, once each. */
export const SetListReorderSchema = v.object({
	setListId: NanoIdSchema,
	ids: v.pipe(v.array(NanoIdSchema), v.maxLength(MAX_SET_LIST_ITEMS)),
});
export type SetListReorder = v.InferOutput<typeof SetListReorderSchema>;

/** A pasted list (docs/band-plan.md, "Set list"): one row per line, matched to songs by title. */
export const SetListPasteSchema = v.object({
	setListId: NanoIdSchema,
	text: v.pipe(v.string(), v.maxLength(20000, "That is too much text at once.")),
});
export type SetListPaste = v.InferOutput<typeof SetListPasteSchema>;
