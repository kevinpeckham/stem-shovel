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
 * **Merging** (docs/user-docs.md, "Merging the seed into an edited page"):
 *
 *   bun run db:update-docs --merge                    # every page whose file changed, as a dry run
 *   bun run db:update-docs --merge looper studio      # these pages
 *   bun run db:update-docs --merge --apply            # write the clean merges
 *
 * carries the seed's changes onto a page edited in the app with a
 * three-way merge (src/lib/utils/mergeThreeWay.ts): the base is the seed
 * text the page was last written from, found as the newest git revision of
 * the file that is also a saved version of the page (git keeps every seed
 * text; the page keeps its versions). A change in the seed alone lands on
 * the page, Kevin's edits stay, and a region both changed is printed as a
 * conflict and the page left alone, for the app's editor. Without
 * `--apply` nothing is written: the merged text is printed to read first.
 *
 * No import of src/lib/server (it pulls in $app/*).
 */
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { drizzle } from "drizzle-orm/libsql";
import { desc, eq } from "drizzle-orm";
import * as schema from "../src/lib/server/db/schema";
import { libsqlUrl } from "../src/lib/utils/libsqlUrl";
import { mergeThreeWay } from "../src/lib/utils/mergeThreeWay";

const run = promisify(execFile);
const args = process.argv.slice(2);
const force = args.includes("--force");
const apply = args.includes("--apply");
const mode = args.includes("--list")
	? "list"
	: args.includes("--restore")
		? "restore"
		: args.includes("--merge")
			? "merge"
			: "update";
const rest = args.filter((a) => !a.startsWith("--"));
if (rest.length === 0 && mode !== "merge") {
	console.error(
		"usage: bun run db:update-docs [--force] <slug> [<slug> ...]\n       bun run db:update-docs --list <slug>\n       bun run db:update-docs --restore <slug> <version>\n       bun run db:update-docs --merge [--apply] [<slug> ...]",
	);
	process.exit(2);
}
const DOCS_DIR = new URL("./user-docs/", import.meta.url);
/** Pages whose seed is only ever the starting text: written in the app from then on, never merged (the releases page, docs/user-docs.md). */
const IN_APP_ONLY = new Set(["releases"]);
const REPO = new URL("../", import.meta.url).pathname;
/** A seed file as the script writes it: LF, trimmed, one trailing newline. */
const normalize = (text: string) => text.replace(/\r\n/g, "\n").trim().concat("\n");
async function seedOf(slug: string) {
	return normalize(await readFile(new URL(`${slug}.md`, DOCS_DIR), "utf8"));
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

/**
 * The common base for a merge: the seed text the page was last written
 * from. Every past seed text is in git; the page keeps its versions (the
 * app keeps the newest ten, the script's writes all): the newest git
 * revision of the file whose text is a saved version of the page. Failing
 * that, the newest version the script wrote (it wrote a seed text); failing
 * that, null.
 */
async function baseOf(
	slug: string,
	versions: {
		markdown: string;
		contentHash: string;
		createdBy: string | null;
		versionNumber: number;
	}[],
): Promise<{ text: string; from: string } | null> {
	const file = `scripts/user-docs/${slug}.md`;
	const hashes = new Set(versions.map((v) => v.contentHash));
	let shas: string[] = [];
	try {
		const { stdout } = await run("git", ["log", "--format=%h", "--", file], { cwd: REPO });
		shas = stdout.split("\n").filter(Boolean);
	} catch {
		// No git here (a checkout without history): the versions alone decide.
	}
	for (const sha of shas) {
		try {
			const { stdout } = await run("git", ["show", `${sha}:${file}`], {
				cwd: REPO,
				maxBuffer: 16 * 1024 * 1024,
			});
			const text = normalize(stdout);
			if (hashes.has(await hash(text))) return { text, from: `git ${sha}` };
		} catch {
			// A revision where the file did not exist.
		}
	}
	// Without git history at all, the newest version the script wrote is a seed text; with history, a version the
	// script wrote that matches no revision is a merge's result and is no base (it carries the app's edits).
	if (shas.length === 0) {
		const scripted = versions.find((v) => !v.createdBy);
		if (scripted) return { text: scripted.markdown, from: `the page's v${scripted.versionNumber}` };
	}
	return null;
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
} else if (mode === "merge") {
	const slugs =
		rest.length > 0
			? rest
			: (await readdir(DOCS_DIR))
					.filter((f) => f.endsWith(".md"))
					.map((f) => f.slice(0, -3))
					.sort();
	let clean = 0;
	let conflicted = 0;
	let written = 0;
	for (const slug of slugs) {
		if (IN_APP_ONLY.has(slug)) {
			if (rest.length > 0)
				console.log(
					`${slug}: written in the app only; its seed is the starting text and is never merged`,
				);
			continue;
		}
		const page = await pageOf(slug);
		if (!page) {
			console.log(`${slug}: not in the database (db:seed-docs adds it)`);
			continue;
		}
		const seed = await seedOf(slug);
		if ((await hash(seed)) === page.doc.contentHash) {
			if (rest.length > 0) console.log(`${slug}: already current`);
			continue;
		}
		const base = await baseOf(slug, page.versions);
		const title = seed.match(/^# (.+)$/m)?.[1]?.trim() ?? page.doc.title;
		if (base === null) {
			console.log(
				`${slug}: no common base found (no git revision of the file matches a saved version); --force to overwrite, or merge by hand`,
			);
			conflicted++;
			continue;
		}
		if (base.text === seed) {
			// The page was written from this very text and edited since: the seed brings nothing new.
			if (rest.length > 0)
				console.log(
					`${slug}: edited in the app, and the seed has not changed since; nothing to merge`,
				);
			continue;
		}
		if (base.text === page.doc.markdown) {
			// Not edited in the app since: the seed goes on as it is.
			console.log(
				`${slug}: not edited in the app; the seed replaces it${apply ? "" : " (--apply)"}`,
			);
			clean++;
			if (apply) {
				const made = await write(page.doc, seed, title);
				console.log(`  written as version ${made}`);
				written++;
			}
			continue;
		}
		const merged = mergeThreeWay(base.text, page.doc.markdown, seed, {
			ours: "the page as edited in the app",
			theirs: "the seed file",
		});
		if (merged.conflicts.length > 0) {
			conflicted++;
			console.log(
				`${slug}: ${merged.conflicts.length} conflict${merged.conflicts.length === 1 ? "" : "s"} (base: ${base.from}); left alone. Settle in the app's editor:`,
			);
			for (const c of merged.conflicts) {
				console.log("  --- the page has:");
				console.log(c.ours.map((l) => `  | ${l}`).join("\n") || "  | (nothing)");
				console.log("  --- the seed has:");
				console.log(c.theirs.map((l) => `  | ${l}`).join("\n") || "  | (nothing)");
			}
			continue;
		}
		clean++;
		console.log(
			`${slug}: merges cleanly (base: ${base.from}; +${merged.added} −${merged.removed} lines from the seed, the app's edits kept)${apply ? "" : " (--apply to write)"}`,
		);
		if (!apply) {
			// What would change on the page: the lines the seed brings, in context.
			const before = new Set(page.doc.markdown.split("\n"));
			const fresh = merged.text.split("\n").filter((l) => !before.has(l));
			if (fresh.length > 0) console.log(fresh.map((l) => `  + ${l}`).join("\n"));
		} else {
			// Two versions: the seed text first (the next merge's base, since it matches a git revision), then the merged page.
			const doc = page.doc;
			const seedVersion = await write(doc, seed, title);
			const made = await write({ ...doc, version: seedVersion }, normalize(merged.text), title);
			console.log(`  written as version ${made} (v${seedVersion} is the seed it was merged from)`);
			written++;
		}
	}
	// A conflict is the run's answer, not its failure: exit 0, so the runner adds no noise under the summary.
	console.log(
		`${clean} page${clean === 1 ? "" : "s"} merge cleanly, ${conflicted} need${conflicted === 1 ? "s" : ""} a hand${apply ? `; ${written} written` : "; nothing written (--apply)"}`,
	);
} else {
	for (const slug of rest) {
		const page = await pageOf(slug);
		if (!page) {
			console.log(`${slug}: not in the database (db:seed-docs adds it)`);
			continue;
		}
		const markdown = await seedOf(slug);
		if ((await hash(markdown)) === page.doc.contentHash) {
			console.log(`${slug}: already current`);
			continue;
		}
		// Edited in the app: the page's text is not the seed it was written from (or, without a base, its newest version carries an author).
		const newest = page.versions[0];
		const base = await baseOf(slug, page.versions);
		const edited = base ? base.text !== page.doc.markdown : !!newest?.createdBy;
		if (edited && !force) {
			console.log(
				`${slug}: skipped, edited in the app since the script last wrote it${newest?.createdBy ? ` (v${newest.versionNumber}, ${newest.author?.email ?? newest.createdBy})` : ""}; --merge carries the source's changes onto it, or --force overwrites (the edit stays in --list)`,
			);
			continue;
		}
		const title = markdown.match(/^# (.+)$/m)?.[1]?.trim() ?? page.doc.title;
		const made = await write(page.doc, markdown, title);
		console.log(`${slug}: updated to version ${made}`);
	}
}
