import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { FileKind } from "../../../constants/fileFormats";
import type { StemStatus } from "../../../val/StemStatusSchema";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { song } from "./song";
import { user } from "./user";

/**
 * A file attached to a song (docs/uploads-and-blob.md, "Attachments"): a
 * chart or lead sheet as a PDF, a picture, a reference recording, a text
 * note, a MIDI file, anything to keep with the song and download from its
 * page. One file in Vercel Blob with an optional title and description, a
 * thumbnail the uploader's browser rendered (a PDF's first page), and a
 * share code that is its permanent address (`/f/<code>`), whichever store
 * the file is in. Same reserve → upload → ready lifecycle as a demo; the
 * server checks the file's first bytes by kind before calling it ready.
 * `isNotation` marks a PDF or image that is a score, which the Chart tab
 * lists beside the notation files.
 *
 * The table keeps its historical name `song_pdf`: it held PDFs alone until
 * 2026-10-06, and a rename would have needed a data copy for nothing.
 */
export const songFile = table(
	"song_pdf",
	{
		id: id(),
		accountId: t
			.text("account_id")
			.notNull()
			.references(() => account.id, { onDelete: "cascade" }),
		songId: t
			.text("song_id")
			.notNull()
			.references(() => song.id, { onDelete: "cascade" }),
		/** What the file is, by its extension (constants/fileFormats.ts); rows from before 2026-10-06 are PDFs. */
		kind: t.text("kind").$type<FileKind>().notNull().default("pdf"),
		/** Defaults to the filename minus its extension; may be emptied. */
		title: t.text("title").notNull().default(""),
		description: t.text("description").notNull().default(""),
		status: t.text("status").$type<StemStatus>().notNull().default("uploading"),
		url: t.text("url").notNull(),
		pathname: t.text("pathname").notNull().unique(),
		filename: t.text("filename").notNull(),
		sizeBytes: t.integer("size_bytes").notNull(),
		pageCount: t.integer("page_count"),
		/** A score (notation as a PDF or an image): shown on the Chart tab's notation view as well as the Attachments tab. */
		isNotation: t.integer("is_notation", { mode: "boolean" }).notNull().default(false),
		thumbnailUrl: t.text("thumbnail_url"),
		thumbnailPathname: t.text("thumbnail_pathname"),
		/** The permanent link's secret: `/f/<code>` (nanoid, 16). */
		shareCode: t.text("share_code").notNull().unique(),
		uploadedBy: t.text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
		...timestamps,
	},
	(table) => [
		t.index("song_pdf_song_idx").on(table.songId),
		t.index("song_pdf_account_idx").on(table.accountId),
		t.index("song_pdf_uploaded_by_idx").on(table.uploadedBy),
	],
);
