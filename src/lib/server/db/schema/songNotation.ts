import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { StemStatus } from "../../../val/StemStatusSchema";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { song } from "./song";
import { user } from "./user";

/**
 * A notation file attached to a song (docs/uploads-and-blob.md, "Notation
 * files"): MusicXML, compressed (`.mxl`) or not (`.musicxml`, `.xml`), that
 * the browser renders with Verovio. The PDF's shape (song_pdf): one file in
 * Vercel Blob with an optional title and description, a first-page
 * thumbnail the uploader's browser rendered, and a share code that is its
 * permanent address (`/f/<code>`), whichever store the file is in. Same
 * reserve → upload → ready lifecycle; the server checks the file's first
 * bytes before calling it ready and never parses the XML itself. Once
 * ready, the jobs function engraves it to a PDF (src/lib/server/notationPdf.ts).
 */
export const songNotation = table(
	"song_notation",
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
		/** Defaults to the filename minus its extension; may be emptied. */
		title: t.text("title").notNull().default(""),
		description: t.text("description").notNull().default(""),
		/** Compressed MusicXML (`.mxl`, a zip) or the plain XML (`.musicxml`, `.xml`). */
		format: t.text("format").$type<"mxl" | "musicxml">().notNull(),
		status: t.text("status").$type<StemStatus>().notNull().default("uploading"),
		url: t.text("url").notNull(),
		pathname: t.text("pathname").notNull().unique(),
		filename: t.text("filename").notNull(),
		contentType: t.text("content_type").notNull(),
		sizeBytes: t.integer("size_bytes").notNull(),
		pageCount: t.integer("page_count"),
		thumbnailUrl: t.text("thumbnail_url"),
		thumbnailPathname: t.text("thumbnail_pathname"),
		/** The score as a PDF, engraved by the jobs function once the file is ready (`<id>.pdf` beside it); `/f/<code>?download=pdf` serves it. */
		pdfUrl: t.text("pdf_url"),
		pdfPathname: t.text("pdf_pathname"),
		/** Null until the file is ready; `pending` while the PDF renders, then `ready` or `failed`. */
		pdfStatus: t.text("pdf_status").$type<"pending" | "ready" | "failed">(),
		/** The permanent link's secret: `/f/<code>` (nanoid, 16). */
		shareCode: t.text("share_code").notNull().unique(),
		uploadedBy: t.text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
		...timestamps,
	},
	(table) => [
		t.index("song_notation_song_idx").on(table.songId),
		t.index("song_notation_account_idx").on(table.accountId),
		t.index("song_notation_uploaded_by_idx").on(table.uploadedBy),
	],
);
