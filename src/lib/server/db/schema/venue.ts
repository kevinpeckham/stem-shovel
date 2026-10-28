import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import { id, timestamps } from "./columns";
import { user } from "./user";

/**
 * A venue (docs/band-plan.md, "Event"): a physical place, global, shared by
 * every band on Stem Shovel so two bands never enter the same one twice.
 * Name and city are unique across the table, case-insensitively, enforced
 * in code (src/lib/server/data.ts). An account keeps the venues it uses on
 * its list through `account_venue`, which also holds the band's own notes
 * and contact; its shows and practices point here (`event.venue_id`).
 * Never deleted in this release.
 */
export const venue = table(
	"venue",
	{
		id: id(),
		name: t.text("name").notNull(),
		address: t.text("address").notNull().default(""),
		city: t.text("city").notNull().default(""),
		/** Empty means a map search of the address, built at render time. */
		mapUrl: t.text("map_url").notNull().default(""),
		/** The venue's own website, https only, or "". */
		websiteUrl: t.text("website_url").notNull().default(""),
		createdBy: t.text("created_by").references(() => user.id, { onDelete: "set null" }),
		/** Whoever last changed the shared facts. */
		updatedBy: t.text("updated_by").references(() => user.id, { onDelete: "set null" }),
		...timestamps,
	},
	(table) => [
		t.index("venue_name_idx").on(table.name),
		t.index("venue_created_by_idx").on(table.createdBy),
		t.index("venue_updated_by_idx").on(table.updatedBy),
	],
);
