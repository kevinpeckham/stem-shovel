import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { DrumVoiceId } from "../../../constants/drumMachine";
import type { StemStatus } from "../../../val/StemStatusSchema";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { drumKit } from "./drumKit";
import { user } from "./user";

/**
 * One voice's sample in a custom kit: an audio file in Vercel Blob with the
 * reserve → upload → ready lifecycle of a demo. A replacement is a new row
 * that goes ready while the old one still plays; the old row and its file
 * go once the new one is ready, so a kit never loses a voice mid-upload.
 * An account kit's files sit under the account (counted against its
 * storage, in the private store when there is one); a site kit's under
 * `site/kits/` in the public store.
 */
export const drumSample = table(
	"drum_sample",
	{
		id: id(),
		kitId: t
			.text("kit_id")
			.notNull()
			.references(() => drumKit.id, { onDelete: "cascade" }),
		/** Null for a site kit's sample. */
		accountId: t.text("account_id").references(() => account.id, { onDelete: "cascade" }),
		voice: t.text("voice").$type<DrumVoiceId>().notNull(),
		status: t.text("status").$type<StemStatus>().notNull().default("uploading"),
		url: t.text("url").notNull(),
		pathname: t.text("pathname").notNull().unique(),
		filename: t.text("filename").notNull(),
		contentType: t.text("content_type").notNull(),
		sizeBytes: t.integer("size_bytes").notNull(),
		uploadedBy: t.text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
		...timestamps,
	},
	(table) => [
		t.index("drum_sample_kit_idx").on(table.kitId),
		t.index("drum_sample_account_idx").on(table.accountId),
		t.index("drum_sample_uploaded_by_idx").on(table.uploadedBy),
	],
);
