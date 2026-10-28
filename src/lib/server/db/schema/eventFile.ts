import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { EventFileKind } from "../../../constants/eventFiles";
import { account } from "./account";
import { id, shareCodeColumn, thumbnailColumns, timestamps, uploadColumns } from "./columns";
import { event } from "./event";
import { user } from "./user";

/**
 * A file of a show or practice (docs/band-plan.md, "Posters, pictures and
 * video"): the event's poster (a PDF or an image, uploaded before the night,
 * downloaded and shared for printing, and the event's picture on the Shows
 * and Practices tiles and its page) or one of its photos (images from the
 * night). One poster per event: a new one replaces the old, row and blobs.
 * Same reserve → upload → ready lifecycle as an attachment
 * (`/api/events/<id>/files`, `/api/event-files/<id>/ready`); the server
 * checks the file's first bytes by kind before calling it ready. Events are
 * never private, so the files live in the public store under
 * `accounts/<a>/events/<e>/files/`, with a thumbnail the uploader's browser
 * rendered beside them and a share code that is the file's permanent
 * address (`/f/<code>`). Deleted with the event and the account
 * (src/lib/server/cascade.ts; the blobs by the caller).
 */
export const eventFile = table(
	"event_file",
	{
		id: id(),
		accountId: t
			.text("account_id")
			.notNull()
			.references(() => account.id, { onDelete: "cascade" }),
		/** The show or practice; nullable so a poster may later be kept without one. */
		eventId: t.text("event_id").references(() => event.id, { onDelete: "cascade" }),
		kind: t.text("kind").$type<EventFileKind>().notNull(),
		...uploadColumns(),
		/** From the extension (constants/fileFormats.ts): what `/f/<code>?download=1` sends it as. */
		contentType: t.text("content_type").notNull(),
		/** The image's size as the browser measured it (a PDF poster's first page); null when it did not. */
		width: t.integer("width"),
		height: t.integer("height"),
		caption: t.text("caption").notNull().default(""),
		/** A photo's place in the gallery; ties go to the older. */
		sortOrder: t.integer("sort_order").notNull().default(0),
		...thumbnailColumns(),
		shareCode: shareCodeColumn(),
		uploadedBy: t.text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
		...timestamps,
	},
	(table) => [
		t.index("event_file_account_idx").on(table.accountId),
		t.index("event_file_event_idx").on(table.eventId),
		t.index("event_file_event_kind_idx").on(table.eventId, table.kind),
		t.index("event_file_uploaded_by_idx").on(table.uploadedBy),
	],
);
