import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import { id, timestamps } from "./columns";

/**
 * An address an account, a project or a song used to have (docs/data-model.md,
 * "slug_alias"). A rename that changes the slug writes the old one here, and
 * the page loaders fall back to it when a slug is not live, answering a
 * permanent redirect to the current address, so links already shared keep
 * working. `scopeId` is what the slug was unique within: the account for a
 * project, the project for a song, "" for an account (unique site-wide).
 * The live slug always wins: creating or renaming something onto a slug
 * removes the alias for it, which is also what keeps a rename and its
 * reversal from redirecting in a circle (src/lib/server/slugAlias.ts).
 */
export const slugAlias = table(
	"slug_alias",
	{
		id: id(),
		kind: t.text("kind").$type<"account" | "project" | "song">().notNull(),
		scopeId: t.text("scope_id").notNull().default(""),
		slug: t.text("slug").notNull(),
		/** The account, project or song the slug belonged to. */
		targetId: t.text("target_id").notNull(),
		...timestamps,
	},
	(table) => [
		t.unique("slug_alias_slug_unique").on(table.kind, table.scopeId, table.slug),
		t.index("slug_alias_target_idx").on(table.targetId),
	],
);
