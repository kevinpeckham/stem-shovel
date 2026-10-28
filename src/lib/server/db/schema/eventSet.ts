import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import { event } from "./event";
import { setList } from "./setList";
import { id, timestamps } from "./columns";

/**
 * One set of an event (docs/band-plan.md, "Event"): a set list attached
 * under a label ("Set 1", "Encore"), ordered by `sortOrder`. The same set
 * list may be attached twice under two labels. Goes with its event or its
 * set list (src/lib/server/cascade.ts).
 */
export const eventSet = table(
	"event_set",
	{
		id: id(),
		eventId: t
			.text("event_id")
			.notNull()
			.references(() => event.id, { onDelete: "cascade" }),
		setListId: t
			.text("set_list_id")
			.notNull()
			.references(() => setList.id, { onDelete: "cascade" }),
		sortOrder: t.integer("sort_order").notNull().default(0),
		label: t.text("label").notNull().default(""),
		...timestamps,
	},
	(table) => [
		t.index("event_set_event_idx").on(table.eventId),
		t.index("event_set_set_list_idx").on(table.setListId),
	],
);
