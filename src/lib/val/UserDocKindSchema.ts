import * as v from "valibot";

/** What a user_doc row is: a page of the documentation (/docs) or a blog post (/blog). */
/** "doc": a page of /docs; "post": a blog post; "copy": a page's own words (its title, intro and tips), edited in the app and rendered on that page (docs/page-copy.md). */
export const USER_DOC_KINDS = ["doc", "post", "copy"] as const;

export const UserDocKindSchema = v.picklist(USER_DOC_KINDS);

export type UserDocKind = v.InferOutput<typeof UserDocKindSchema>;
