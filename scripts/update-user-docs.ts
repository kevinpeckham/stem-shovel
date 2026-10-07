/**
 * Refreshes user documentation pages (/docs) and page-copy docs from
 * scripts/user-docs/*.md after the source changed — the seed
 * (db:seed-docs) only adds pages that are missing. Each named page gets
 * the file's markdown and a new version row, as a save in the app would;
 * an unchanged page is left alone.
 *
 *   bun run db:update-docs reporting-a-bug privacy-policy
 *
 * A page edited in the app since the script last wrote it is **skipped**
 * (its newest version carries an author; the script's carry none), so an
 * edit made on the live site is never overwritten by accident (Kevin lost
 * his Studio copy that way, 2026-10-07). `--force` overwrites anyway; the
 * previous text stays in user_doc_version either way, and:
 *
 *   bun run db:update-docs --list studio-page         # every version, newest first
 *   bun run db:update-docs --restore studio-page 4    # that version back as the page
 *
 * No import of src/lib/server (it pulls in $app/*).
 */
import { readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/libsql";
import { desc, eq } from "drizzle-orm";
import * as schema from "../src/lib/server/db/schema";
import { libsqlUrl } from "../src/lib/utils/libsqlUrl";

const args = process.argv.slice(2);
const force = args.includes("--force");
const mode = args.includes("--list") ? "list" : args.includes("--restore") ? "restore" : "update";
const rest = args.filter((a) => !a.startsWith("--"));
if (rest.length === 0) {
	console.error(
		"usage: bun run db:update-docs [--force] <slug> [<slug> ...]\n       bun run db:update-docs --list <slug>\n       bun run db:update-docs --restore <slug> <version>",
	);
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

/** The page, and its versions newest first. */
async function pageOf(slug: string) {
	const doc = await db.query.userDoc.findFirst({ where: eq(schema.userDoc.slug, slug) });
	if (!doc) return null;
	const versions = await db.query.userDocVersion.findMany({
		where: eq(schema.userDocVersion.docId, doc.id),
		orderBy: [desc(schema.userDocVersion.versionNumber)],
		with: { author: { columns: { email: true } } },
	});
	return { doc, versions };
}

/** Writes `markdown` as the page's next version; `author` null marks a write by this script. */
async function write(doc: typeof schema.userDoc.$inferSelect, markdown: string, title: string) {
	const contentHash = await hash(markdown);
	const version = doc.version + 1;
	await db.insert(schema.userDocVersion).values({
		docId: doc.id,
		versionNumber: version,
		markdown,
		contentHash,
	});
	await db
		.update(schema.userDoc)
		.set({ title, markdown, contentHash, version, updatedAt: new Date() })
		.where(eq(schema.userDoc.id, doc.id));
	return version;
}

if (mode === "list") {
	const page = await pageOf(rest[0]);
	if (!page) {
		console.log(`${rest[0]}: not in the database`);
		process.exit(1);
	}
	console.log(`${rest[0]}: version ${page.doc.version} is the page`);
	for (const v of page.versions) {
		const who = v.author?.email
			? `edited in the app by ${v.author.email}`
			: "written by the script";
		const first = v.markdown.split("\n").find((l) => l.trim() && !l.startsWith("#")) ?? "";
		console.log(
			`  v${v.versionNumber}  ${v.createdAt.toISOString().slice(0, 16)}  ${who}\n      ${first.slice(0, 100)}`,
		);
	}
} else if (mode === "restore") {
	const [slug, n] = rest;
	const page = await pageOf(slug);
	const version = page?.versions.find((v) => v.versionNumber === Number(n));
	if (!page || !version) {
		console.log(`${slug}: no version ${n} (--list shows them)`);
		process.exit(1);
	}
	const title = version.markdown.match(/^# (.+)$/m)?.[1]?.trim() ?? page.doc.title;
	const made = await write(page.doc, version.markdown, title);
	console.log(`${slug}: version ${n} restored as version ${made}`);
} else {
	for (const slug of rest) {
		const page = await pageOf(slug);
		if (!page) {
			console.log(`${slug}: not in the database (db:seed-docs adds it)`);
			continue;
		}
		const markdown = (await readFile(new URL(`./user-docs/${slug}.md`, import.meta.url), "utf8"))
			.replace(/\r\n/g, "\n")
			.trim()
			.concat("\n");
		if ((await hash(markdown)) === page.doc.contentHash) {
			console.log(`${slug}: already current`);
			continue;
		}
		const newest = page.versions[0];
		if (newest?.createdBy && !force) {
			console.log(
				`${slug}: skipped, edited in the app since the script last wrote it (v${newest.versionNumber}, ${newest.author?.email ?? newest.createdBy}); merge the source by hand, or --force to overwrite (the edit stays in --list)`,
			);
			continue;
		}
		const title = markdown.match(/^# (.+)$/m)?.[1]?.trim() ?? page.doc.title;
		const made = await write(page.doc, markdown, title);
		console.log(`${slug}: updated to version ${made}`);
	}
}
