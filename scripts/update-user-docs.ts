/**
 * Refreshes user documentation pages (/docs) from scripts/user-docs/*.md
 * after the source changed — the seed (db:seed-docs) only adds pages that
 * are missing. Each named page gets the file's markdown and a new version
 * row, as a save in the app would; an unchanged page is left alone.
 *
 *   bun run db:update-docs reporting-a-bug privacy-policy
 *
 * Careful: it overwrites what was edited in the app for those pages (the
 * previous text stays in user_doc_version). No import of src/lib/server
 * (it pulls in $app/*).
 */
import { readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/server/db/schema";
import { libsqlUrl } from "../src/lib/utils/libsqlUrl";

const slugs = process.argv.slice(2);
if (slugs.length === 0) {
	console.error("usage: bun run db:update-docs <slug> [<slug> ...]");
	process.exit(2);
}

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

for (const slug of slugs) {
	const existing = await db.query.userDoc.findFirst({ where: eq(schema.userDoc.slug, slug) });
	if (!existing) {
		console.log(`${slug}: not in the database (db:seed-docs adds it)`);
		continue;
	}
	const markdown = (await readFile(new URL(`./user-docs/${slug}.md`, import.meta.url), "utf8"))
		.replace(/\r\n/g, "\n")
		.trim()
		.concat("\n");
	const contentHash = await hash(markdown);
	if (contentHash === existing.contentHash) {
		console.log(`${slug}: already current`);
		continue;
	}
	const title = markdown.match(/^# (.+)$/m)?.[1]?.trim() ?? existing.title;
	const version = existing.version + 1;
	await db.insert(schema.userDocVersion).values({
		docId: existing.id,
		versionNumber: version,
		markdown,
		contentHash,
	});
	await db
		.update(schema.userDoc)
		.set({ title, markdown, contentHash, version, updatedAt: new Date() })
		.where(eq(schema.userDoc.id, existing.id));
	console.log(`${slug}: updated to version ${version}`);
}
