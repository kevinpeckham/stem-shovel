import * as v from "valibot";

/** What a user_doc row is: a page of the documentation (/docs) or a blog post (/blog). */
export const USER_DOC_KINDS = ["doc", "post"] as const;

export const UserDocKindSchema = v.picklist(USER_DOC_KINDS);

export type UserDocKind = v.InferOutput<typeof UserDocKindSchema>;
