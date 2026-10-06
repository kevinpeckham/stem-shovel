import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { ShortLinkKind } from "../../../val/ShortLinkSchema";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { user } from "./user";

/**
 * A short link: an 8-character code (`SHORT_LINK_ALPHABET`, no 0/O/1/l/I)
 * for a page on the app, its query and hash included (`target`, a path
 * starting with `/`, never another origin). Anyone mints one, signed in or
 * not; the instruments' share links are the reason. A signed-in user's
 * link never expires and is reused for the same target; an anonymous one
 * lives `SHORT_LINK_ANONYMOUS_DAYS` and is swept by the daily cron. `hits`
 * and `last_hit_at` count arrivals. Resolved at `/x/<code>` and on the
 * short domain (`SHORT_LINK_ORIGIN`, src/hooks.server.ts).
 */
export const shortLink = table(
	"short_link",
	{
		id: id(),
		code: t.text("code").notNull().unique(),
		target: t.text("target").notNull(),
		kind: t.text("kind").$type<ShortLinkKind>().notNull(),
		createdBy: t.text("created_by").references(() => user.id, { onDelete: "set null" }),
		accountId: t.text("account_id").references(() => account.id, { onDelete: "set null" }),
		/** null = never expires (a signed-in user's link). */
		expiresAt: t.integer("expires_at", { mode: "timestamp_ms" }),
		hits: t.integer("hits").notNull().default(0),
		lastHitAt: t.integer("last_hit_at", { mode: "timestamp_ms" }),
		...timestamps,
	},
	(table) => [
		t.index("short_link_created_by_idx").on(table.createdBy),
		t.index("short_link_account_idx").on(table.accountId),
		t.index("short_link_expires_at_idx").on(table.expiresAt),
	],
);
