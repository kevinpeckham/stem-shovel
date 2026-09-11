import type { StemManifest } from "$lib/audio/types";
import { deleteBlobs, stemPathname } from "$lib/server/blob";
import { db, schema } from "$lib/server/db";
import { hashMarkdown } from "$lib/server/markdown";
import { labelFromFilename, MAX_STEMS_PER_SONG, slugify } from "$lib/slug";
import { SlugSchema } from "$lib/val/SlugSchema";
import type { SongDocKind } from "$lib/val/SongDocKindSchema";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import * as v from "valibot";

/**
 * Every function takes the caller's accountId first and scopes by it, so a
 * row from another tenant is simply "not found". Callers get it from
 * `event.locals.account` (see hooks.server.ts).
 */

const { account, project, song, stem, songDocVersion } = schema;

// ---- account (org) --------------------------------------------------------

export type UpdateAccountResult =
	| { ok: true; account: typeof account.$inferSelect }
	| { ok: false; error: string; field: "name" | "slug" };

/** Renames the account and/or changes its slug (unique across all accounts). */
export async function updateAccount(
	accountId: string,
	input: { name: string; slug: string },
): Promise<UpdateAccountResult> {
	const name = input.name.trim();
	if (!name) return { ok: false, field: "name", error: "Give the account a name." };
	const parsed = v.safeParse(SlugSchema, input.slug);
	if (!parsed.success) return { ok: false, field: "slug", error: parsed.issues[0].message };
	const slug = parsed.output;
	const clash = await db.query.account.findFirst({
		where: eq(account.slug, slug),
		columns: { id: true },
	});
	if (clash && clash.id !== accountId) {
		return { ok: false, field: "slug", error: `Another account already uses "${slug}".` };
	}
	const [row] = await db
		.update(account)
		.set({ name, slug })
		.where(eq(account.id, accountId))
		.returning();
	if (!row) return { ok: false, field: "name", error: "Account not found." };
	return { ok: true, account: row };
}

/** What the account holds: counts and Blob bytes, for the settings page. */
export async function accountUsage(accountId: string) {
	const [projects] = await db
		.select({ n: sql<number>`count(*)` })
		.from(project)
		.where(eq(project.accountId, accountId));
	const [songs] = await db
		.select({ n: sql<number>`count(*)` })
		.from(song)
		.where(eq(song.accountId, accountId));
	const [stems] = await db
		.select({ n: sql<number>`count(*)`, bytes: sql<number | null>`sum(${stem.sizeBytes})` })
		.from(stem)
		.where(and(eq(stem.accountId, accountId), eq(stem.status, "ready")));
	const row = await db.query.account.findFirst({
		where: eq(account.id, accountId),
		with: { members: { with: { user: { columns: { name: true, email: true } } } } },
	});
	return {
		projects: projects.n,
		songs: songs.n,
		stems: stems.n,
		bytes: stems.bytes ?? 0,
		storageLimitBytes: row?.storageLimitBytes ?? null,
		members: (row?.members ?? []).map((m) => ({
			role: m.role,
			name: m.user.name,
			email: m.user.email,
		})),
		createdAt: row?.createdAt ?? null,
	};
}

// ---- projects -------------------------------------------------------------

export function listProjects(accountId: string) {
	return db.query.project.findMany({
		where: and(eq(project.accountId, accountId), eq(project.status, "active")),
		orderBy: [asc(project.sortOrder), asc(project.name)],
	});
}

export async function createProject(accountId: string, userId: string, name: string) {
	const base = slugify(name) || "project";
	const taken = new Set(
		(
			await db.select({ slug: project.slug }).from(project).where(eq(project.accountId, accountId))
		).map((r) => r.slug),
	);
	const [row] = await db
		.insert(project)
		.values({ accountId, name: name.trim(), slug: uniqueSlug(base, taken), createdBy: userId })
		.returning();
	return row;
}

export type UpdateProjectResult =
	| { ok: true; project: typeof project.$inferSelect }
	| { ok: false; error: string; field: "name" | "slug" };

/**
 * Renames a project and/or changes its slug (its URL). The slug must match
 * SLUG_PATTERN and be unique within the account; songs keep working because
 * they reference the project id, not the slug.
 */
export async function updateProject(
	accountId: string,
	projectId: string,
	input: { name: string; slug: string },
): Promise<UpdateProjectResult> {
	const name = input.name.trim();
	if (!name) return { ok: false, field: "name", error: "Give the project a name." };
	const parsed = v.safeParse(SlugSchema, input.slug);
	if (!parsed.success) return { ok: false, field: "slug", error: parsed.issues[0].message };
	const slug = parsed.output;
	const clash = await db.query.project.findFirst({
		where: and(eq(project.accountId, accountId), eq(project.slug, slug)),
		columns: { id: true },
	});
	if (clash && clash.id !== projectId) {
		return { ok: false, field: "slug", error: `Another project already uses /projects/${slug}.` };
	}
	const [row] = await db
		.update(project)
		.set({ name, slug })
		.where(and(eq(project.accountId, accountId), eq(project.id, projectId)))
		.returning();
	if (!row) return { ok: false, field: "name", error: "Project not found." };
	return { ok: true, project: row };
}

/** Slug of a project by id, scoped to the account. */
export async function projectSlug(accountId: string, projectId: string) {
	const row = await db.query.project.findFirst({
		where: and(eq(project.accountId, accountId), eq(project.id, projectId)),
		columns: { slug: true },
	});
	return row?.slug ?? null;
}

/** Project + song slugs of a song by id, scoped to the account. */
export async function songSlugs(accountId: string, songId: string) {
	const row = await db.query.song.findFirst({
		where: and(eq(song.accountId, accountId), eq(song.id, songId)),
		columns: { slug: true },
		with: { project: { columns: { slug: true } } },
	});
	return row ? { project: row.project.slug, song: row.slug } : null;
}

export function getProject(accountId: string, slug: string) {
	return db.query.project.findFirst({
		where: and(eq(project.accountId, accountId), eq(project.slug, slug)),
		with: {
			songs: {
				where: eq(song.status, "active"),
				orderBy: [asc(song.sortOrder), asc(song.title)],
				with: { stems: { columns: { id: true, status: true } } },
			},
		},
	});
}

// ---- songs ----------------------------------------------------------------

export async function createSong(
	accountId: string,
	userId: string,
	projectId: string,
	title: string,
) {
	const base = slugify(title) || "song";
	const taken = new Set(
		(await db.select({ slug: song.slug }).from(song).where(eq(song.projectId, projectId))).map(
			(r) => r.slug,
		),
	);
	const [row] = await db
		.insert(song)
		.values({
			accountId,
			projectId,
			title: title.trim(),
			slug: uniqueSlug(base, taken),
			createdBy: userId,
		})
		.returning();
	return row;
}

export type UpdateSongResult =
	| { ok: true; song: typeof song.$inferSelect }
	| { ok: false; error: string; field: "title" | "slug" | "description" };

/** Title, URL slug (unique within the project) and description. */
export async function updateSong(
	accountId: string,
	songId: string,
	input: { title: string; slug: string; description: string },
): Promise<UpdateSongResult> {
	const title = input.title.trim();
	if (!title) return { ok: false, field: "title", error: "Give the song a title." };
	const parsed = v.safeParse(SlugSchema, input.slug);
	if (!parsed.success) return { ok: false, field: "slug", error: parsed.issues[0].message };
	const slug = parsed.output;
	const existing = await db.query.song.findFirst({
		where: and(eq(song.accountId, accountId), eq(song.id, songId)),
		columns: { id: true, projectId: true },
	});
	if (!existing) return { ok: false, field: "title", error: "Song not found." };
	const clash = await db.query.song.findFirst({
		where: and(eq(song.projectId, existing.projectId), eq(song.slug, slug)),
		columns: { id: true },
	});
	if (clash && clash.id !== songId) {
		return {
			ok: false,
			field: "slug",
			error: `Another song in this project already uses "${slug}".`,
		};
	}
	const [row] = await db
		.update(song)
		.set({ title, slug, description: input.description.trim() })
		.where(eq(song.id, songId))
		.returning();
	return { ok: true, song: row };
}

export async function getSong(accountId: string, projectSlug: string, songSlug: string) {
	const proj = await db.query.project.findFirst({
		where: and(eq(project.accountId, accountId), eq(project.slug, projectSlug)),
		columns: { id: true, name: true, slug: true },
	});
	if (!proj) return null;
	const row = await db.query.song.findFirst({
		where: and(eq(song.projectId, proj.id), eq(song.slug, songSlug)),
		with: { stems: { orderBy: [asc(stem.sortOrder), asc(stem.createdAt)] } },
	});
	return row ? { ...row, project: proj } : null;
}

/** The shape the StemPlayer wants: ready stems only. */
export function manifestFor(s: {
	title: string;
	stems: (typeof stem.$inferSelect)[];
}): StemManifest {
	return {
		title: s.title,
		stems: s.stems
			.filter((st) => st.status === "ready" && st.url)
			.map((st) => ({ id: st.id, label: st.label, url: st.url })),
	};
}

export async function deleteSong(accountId: string, songId: string) {
	const rows = await db
		.select({ url: stem.url })
		.from(stem)
		.where(and(eq(stem.accountId, accountId), eq(stem.songId, songId)));
	await deleteBlobs(rows.map((r) => r.url));
	await db.delete(song).where(and(eq(song.accountId, accountId), eq(song.id, songId))); // stems cascade
}

// ---- stems ----------------------------------------------------------------

export interface NewStemFile {
	filename: string;
	contentType: string;
	sizeBytes: number;
}

/**
 * Step 1 of an upload: reserve a row in `uploading` state and hand back the
 * pathname the browser must upload to. The URL is unknown until the blob
 * exists, so it is "" for now. Returns null for an unknown song and "full"
 * when the song already has MAX_STEMS_PER_SONG stems (counting in-flight ones).
 */
export async function createStem(
	accountId: string,
	userId: string,
	songId: string,
	file: NewStemFile,
) {
	const owner = await db.query.song.findFirst({
		where: and(eq(song.accountId, accountId), eq(song.id, songId)),
		columns: { id: true },
		with: { stems: { columns: { sortOrder: true } } },
	});
	if (!owner) return null;
	if (owner.stems.length >= MAX_STEMS_PER_SONG) return "full";
	const sortOrder = owner.stems.reduce((m, s) => Math.max(m, s.sortOrder + 1), 0);
	const id = nanoid(); // needed before insert to build the pathname
	const [row] = await db
		.insert(stem)
		.values({
			id,
			accountId,
			songId,
			label: labelFromFilename(file.filename),
			sortOrder,
			status: "uploading",
			url: "",
			pathname: stemPathname(accountId, songId, id, file.filename),
			filename: file.filename,
			contentType: file.contentType,
			sizeBytes: file.sizeBytes,
			uploadedBy: userId,
		})
		.returning();
	return row;
}

/**
 * "Upload new version": keep the row (id, label, order) but point it at a
 * fresh pathname and put it back into `uploading`. The old blob is deleted
 * now; if the upload then fails the stem shows as not ready and can be
 * replaced again or removed.
 */
export async function reserveStemReplacement(accountId: string, stemId: string, file: NewStemFile) {
	const existing = await db.query.stem.findFirst({
		where: and(eq(stem.accountId, accountId), eq(stem.id, stemId)),
	});
	if (!existing) return null;
	const version = (existing.pathname.match(/-v(\d+)\.[a-z0-9]+$/)?.[1] ?? 0) as number;
	const pathname = stemPathname(
		accountId,
		existing.songId,
		stemId,
		file.filename,
		Number(version) + 1,
	);
	await deleteBlobs([existing.url]);
	const [row] = await db
		.update(stem)
		.set({
			status: "uploading",
			url: "",
			pathname,
			filename: file.filename,
			contentType: file.contentType,
			sizeBytes: file.sizeBytes,
			durationSeconds: null,
			channels: null,
			peaks: null,
		})
		.where(eq(stem.id, stemId))
		.returning();
	await refreshSongDuration(existing.songId);
	return row;
}

/** Step 2 (server side of handleUpload): the pathname must belong to a reserved row. */
export function findUploadingStem(accountId: string, pathname: string) {
	return db.query.stem.findFirst({
		where: and(
			eq(stem.accountId, accountId),
			eq(stem.pathname, pathname),
			eq(stem.status, "uploading"),
		),
	});
}

export interface StemDecodeResult {
	url: string;
	durationSeconds: number;
	channels: number;
	peaks: number[];
}

/** Step 3: the browser decoded the file; store what it learned and refresh the song length. */
export async function markStemReady(accountId: string, stemId: string, r: StemDecodeResult) {
	const [row] = await db
		.update(stem)
		.set({
			status: "ready",
			url: r.url,
			durationSeconds: r.durationSeconds,
			channels: r.channels,
			peaks: r.peaks,
		})
		.where(and(eq(stem.accountId, accountId), eq(stem.id, stemId)))
		.returning({ songId: stem.songId });
	if (row) await refreshSongDuration(row.songId);
	return row ?? null;
}

/** Production backstop from Vercel's completion webhook: at least record the URL. */
export async function recordStemUrl(pathname: string, url: string) {
	await db
		.update(stem)
		.set({ url, status: "ready" })
		.where(and(eq(stem.pathname, pathname), eq(stem.status, "uploading")));
}

export async function renameStem(accountId: string, stemId: string, label: string) {
	const [row] = await db
		.update(stem)
		.set({ label: label.trim() })
		.where(and(eq(stem.accountId, accountId), eq(stem.id, stemId)))
		.returning({ id: stem.id, label: stem.label });
	return row ?? null;
}

export async function deleteStem(accountId: string, stemId: string) {
	const [row] = await db
		.delete(stem)
		.where(and(eq(stem.accountId, accountId), eq(stem.id, stemId)))
		.returning({ url: stem.url, songId: stem.songId });
	if (!row) return false;
	await deleteBlobs([row.url]);
	await refreshSongDuration(row.songId);
	return true;
}

async function refreshSongDuration(songId: string) {
	const [{ max }] = await db
		.select({ max: sql<number | null>`max(${stem.durationSeconds})` })
		.from(stem)
		.where(and(eq(stem.songId, songId), eq(stem.status, "ready")));
	await db.update(song).set({ durationSeconds: max }).where(eq(song.id, songId));
}

function uniqueSlug(base: string, taken: Set<string>): string {
	if (!taken.has(base)) return base;
	for (let n = 2; ; n++) {
		const candidate = `${base.slice(0, 60)}-${n}`;
		if (!taken.has(candidate)) return candidate;
	}
}

// ---- song documents: chart + lyrics ------------------------------------

const DOC_VERSIONS_TO_KEEP = 10;
/** Blanking a document longer than this needs `confirmEmpty` (accidental-wipe guard). */
const DOC_WIPE_GUARD_CHARS = 200;

const DOC_COLUMNS = {
	chart: { markdown: "chartMarkdown", hash: "chartHash", version: "chartVersion" },
	lyrics: { markdown: "lyricsMarkdown", hash: "lyricsHash", version: "lyricsVersion" },
} as const;

export type SaveDocResult =
	| { ok: true; version: number; changed: boolean }
	| { ok: false; error: string; needsConfirm?: boolean };

/** The markdown of one document, for pages that need only that. */
export function docText(s: { chartMarkdown: string; lyricsMarkdown: string }, kind: SongDocKind) {
	return s[DOC_COLUMNS[kind].markdown];
}

export function docVersion(s: { chartVersion: number; lyricsVersion: number }, kind: SongDocKind) {
	return s[DOC_COLUMNS[kind].version];
}

/**
 * Saves a song document. Mirrors replicator's blog save: the markdown's hash
 * gates whether a new version row is written (a no-op save stays on the
 * current version), and only the most recent DOC_VERSIONS_TO_KEEP are kept.
 */
export async function saveSongDoc(
	accountId: string,
	userId: string,
	songId: string,
	kind: SongDocKind,
	markdown: string,
	opts: { confirmEmpty?: boolean } = {},
): Promise<SaveDocResult> {
	const cols = DOC_COLUMNS[kind];
	const existing = await db.query.song.findFirst({
		where: and(eq(song.accountId, accountId), eq(song.id, songId)),
	});
	if (!existing) return { ok: false, error: "Song not found." };
	const currentText = existing[cols.markdown];
	const currentHash = existing[cols.hash];
	const currentVersion = existing[cols.version];

	const next = markdown.replace(/\r\n/g, "\n");
	if (
		next.trim() === "" &&
		currentText.trim().length > DOC_WIPE_GUARD_CHARS &&
		!opts.confirmEmpty
	) {
		return {
			ok: false,
			needsConfirm: true,
			error: `This would empty the ${kind} while it has content. Save again to confirm.`,
		};
	}

	const contentHash = await hashMarkdown(next);
	if (contentHash === currentHash) return { ok: true, version: currentVersion, changed: false };

	const versionNumber = currentVersion + 1;
	await db.insert(songDocVersion).values({
		songId,
		kind,
		versionNumber,
		markdown: next,
		contentHash,
		createdBy: userId,
	});
	await db
		.update(song)
		.set({ [cols.markdown]: next, [cols.hash]: contentHash, [cols.version]: versionNumber })
		.where(eq(song.id, songId));

	// Prune, keeping the newest N of this document. Best-effort.
	const stale = await db
		.select({ id: songDocVersion.id })
		.from(songDocVersion)
		.where(and(eq(songDocVersion.songId, songId), eq(songDocVersion.kind, kind)))
		.orderBy(desc(songDocVersion.versionNumber))
		.limit(1000) // SQLite requires LIMIT alongside OFFSET
		.offset(DOC_VERSIONS_TO_KEEP);
	if (stale.length > 0) {
		await db.delete(songDocVersion).where(
			inArray(
				songDocVersion.id,
				stale.map((r) => r.id),
			),
		);
	}
	return { ok: true, version: versionNumber, changed: true };
}
