/**
 * Seeds the user documentation (/docs) from scripts/user-docs/*.md — the
 * starting set, written once. A page whose slug already exists is left
 * alone, so edits made in the app are never overwritten; delete a page in
 * the app and rerun to restore its draft.
 *
 *   bun run db:seed-docs
 *
 * The first `# Heading` is the title; the filename is the slug; the order is
 * the list below. No import of src/lib/server (it pulls in $app/*).
 */
import { readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/server/db/schema";
import { libsqlUrl } from "../src/lib/utils/libsqlUrl";

const ORDER = [
	"getting-started",
	"stems-and-playback",
	"song-settings",
	"charts-lyrics-and-notes",
	"idea-recorder",
	"comments",
	"downloads-and-sharing",
	"accounts-and-members",
	"accounts-and-plans",
	"plan-terms",
	"security",
	"notifications",
	"reporting-a-bug",
	"privacy-policy",
	"copyright-policy",
	"releases",
];

const db = drizzle({
	connection: {
		url: libsqlUrl(process.env.TURSO_DATABASE_URL!),
		authToken: process.env.TURSO_AUTH_TOKEN!,
	},
	schema,
});

async function hash(markdown: string) {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(markdown));
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

let added = 0;
for (const [index, slug] of ORDER.entries()) {
	const existing = await db.query.userDoc.findFirst({ where: eq(schema.userDoc.slug, slug) });
	if (existing) continue;
	const markdown = (await readFile(new URL(`./user-docs/${slug}.md`, import.meta.url), "utf8"))
		.replace(/\r\n/g, "\n")
		.trim()
		.concat("\n");
	const title = markdown.match(/^# (.+)$/m)?.[1]?.trim() ?? slug;
	const contentHash = await hash(markdown);
	const [doc] = await db
		.insert(schema.userDoc)
		.values({ slug, title, sortOrder: (index + 1) * 10, markdown, contentHash, version: 1 })
		.returning();
	await db
		.insert(schema.userDocVersion)
		.values({ docId: doc.id, versionNumber: 1, markdown, contentHash });
	added += 1;
	console.log(`added ${slug} — ${title}`);
}
console.log(`${added} page${added === 1 ? "" : "s"} added, ${ORDER.length - added} already there`);
