import type { StemManifest } from "$lib/audio/types";
import { deleteBlobs, demoPathname, stemPathname } from "$lib/server/blob";
import { db, schema } from "$lib/server/db";
import { parseTime } from "$lib/format";
import { hashMarkdown } from "$lib/server/markdown";
import { labelFromFilename, MAX_DEMOS_PER_SONG, MAX_STEMS_PER_SONG, slugify } from "$lib/slug";
import { SlugSchema } from "$lib/val/SlugSchema";
import type { PlaybackStatus } from "$lib/val/PlaybackStatusSchema";
import type { SongDocKind } from "$lib/val/SongDocKindSchema";
import type { SongChange } from "$lib/val/SongChangeSchema";
import type { SongSection } from "$lib/val/SongSectionSchema";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import * as v from "valibot";

/**
 * Every function takes the caller's accountId first and scopes by it, so a
 * row from another tenant is simply "not found". Callers get it from the
 * URL's [account] (checked against locals.memberships) or from the entity's
 * own account via src/lib/server/access.ts.
 */

const { account, project, song, stem, songDocVersion, demo } = schema;

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

/** Account + project slugs of a project by id, scoped to the account. */
export async function projectSlugs(accountId: string, projectId: string) {
	const row = await db.query.project.findFirst({
		where: and(eq(project.accountId, accountId), eq(project.id, projectId)),
		columns: { slug: true },
		with: { account: { columns: { slug: true } } },
	});
	return row ? { account: row.account.slug, project: row.slug } : null;
}

/** Account + project + song slugs of a song by id, scoped to the account. */
export async function songSlugs(accountId: string, songId: string) {
	const row = await db.query.song.findFirst({
		where: and(eq(song.accountId, accountId), eq(song.id, songId)),
		columns: { slug: true },
		with: { project: { columns: { slug: true } }, account: { columns: { slug: true } } },
	});
	return row ? { account: row.account.slug, project: row.project.slug, song: row.slug } : null;
}

export function getProject(accountId: string, slug: string) {
	return db.query.project.findFirst({
		where: and(eq(project.accountId, accountId), eq(project.slug, slug)),
		with: {
			songs: {
				where: eq(song.status, "active"),
				orderBy: [asc(song.sortOrder), asc(song.title)],
				with: {
					stems: {
						columns: { id: true, status: true, url: true, playbackStatus: true, playbackUrl: true },
					},
				},
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
	input: {
		title: string;
		slug: string;
		description: string;
		songwriter: string;
		writtenOn: string;
		startAt: string;
		endAt: string;
	},
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
		.set({
			title,
			slug,
			description: input.description.trim(),
			songwriter: input.songwriter.trim(),
			writtenOn: input.writtenOn || null,
			startAt: input.startAt ? parseTime(input.startAt) : null,
			endAt: input.endAt ? parseTime(input.endAt) : null,
		})
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
		with: {
			stems: { orderBy: [asc(stem.sortOrder), asc(stem.createdAt)] },
			demos: { orderBy: [asc(demo.createdAt)] },
		},
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
			.map((st) => ({
				id: st.id,
				label: st.label,
				// The player streams the rendition once it exists; the source until then.
				url: st.playbackStatus === "ready" && st.playbackUrl ? st.playbackUrl : st.url,
				duration: st.durationSeconds ?? undefined,
				channels: st.channels ?? undefined,
				peaks: st.peaks ?? undefined,
			})),
	};
}

export async function deleteSong(accountId: string, songId: string) {
	const rows = await db
		.select({ url: stem.url, playbackUrl: stem.playbackUrl })
		.from(stem)
		.where(and(eq(stem.accountId, accountId), eq(stem.songId, songId)));
	const s = await db.query.song.findFirst({
		where: eq(song.id, songId),
		columns: { mixUrl: true },
	});
	const demos = await db
		.select({ url: demo.url, playbackUrl: demo.playbackUrl })
		.from(demo)
		.where(and(eq(demo.accountId, accountId), eq(demo.songId, songId)));
	await deleteBlobs([
		...rows.flatMap((r) => [r.url, r.playbackUrl ?? ""]),
		...demos.flatMap((d) => [d.url, d.playbackUrl ?? ""]),
		s?.mixUrl ?? "",
	]);
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
	await deleteBlobs([existing.url, existing.playbackUrl ?? ""]);
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
			...NO_PLAYBACK,
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
		.returning({ url: stem.url, playbackUrl: stem.playbackUrl, songId: stem.songId });
	if (!row) return null;
	await deleteBlobs([row.url, row.playbackUrl ?? ""]);
	await refreshSongDuration(row.songId);
	return { songId: row.songId };
}

// ---- song sections ----------------------------------------------------------

export type SaveSectionsResult =
	| { ok: true; sections: SongSection[] }
	| { ok: false; error: string };

/** Replaces the song's sections: sorted by start, no two at the same time. */
export async function updateSongSections(
	accountId: string,
	songId: string,
	input: SongSection[],
): Promise<SaveSectionsResult> {
	const sections = input
		.map((s) => ({ name: s.name.trim(), start: Math.round(s.start * 10) / 10 }))
		.sort((a, b) => a.start - b.start);
	for (let i = 1; i < sections.length; i++) {
		if (sections[i].start === sections[i - 1].start) {
			return { ok: false, error: `Two sections start at ${sections[i].start}s.` };
		}
	}
	const [row] = await db
		.update(song)
		.set({ sections })
		.where(and(eq(song.accountId, accountId), eq(song.id, songId)))
		.returning({ sections: song.sections });
	if (!row) return { ok: false, error: "Song not found." };
	return { ok: true, sections: row.sections };
}

export type SaveChangesResult = { ok: true; changes: SongChange[] } | { ok: false; error: string };

/** Replaces the song's tempo / key / time signature changes: sorted by start, one per kind per time. */
export async function updateSongChanges(
	accountId: string,
	songId: string,
	input: SongChange[],
): Promise<SaveChangesResult> {
	const changes = input
		.map((c) => ({ kind: c.kind, start: Math.round(c.start * 10) / 10, value: c.value.trim() }))
		.sort((a, b) => a.start - b.start || a.kind.localeCompare(b.kind));
	for (let i = 1; i < changes.length; i++) {
		if (changes[i].start === changes[i - 1].start && changes[i].kind === changes[i - 1].kind) {
			return { ok: false, error: `Two ${changes[i].kind} changes start at ${changes[i].start}s.` };
		}
	}
	const [row] = await db
		.update(song)
		.set({ changes })
		.where(and(eq(song.accountId, accountId), eq(song.id, songId)))
		.returning({ changes: song.changes });
	if (!row) return { ok: false, error: "Song not found." };
	return { ok: true, changes: row.changes };
}

// ---- demo recordings --------------------------------------------------------

/**
 * Step 1 of a demo upload: reserve the row (same lifecycle as a stem, without
 * decoding). Returns null for an unknown song, "full" at MAX_DEMOS_PER_SONG.
 */
export async function createDemo(
	accountId: string,
	userId: string,
	songId: string,
	file: NewStemFile,
) {
	const s = await db.query.song.findFirst({
		where: and(eq(song.accountId, accountId), eq(song.id, songId)),
		columns: { id: true },
	});
	if (!s) return null;
	const [{ n }] = await db
		.select({ n: sql<number>`count(*)` })
		.from(demo)
		.where(eq(demo.songId, songId));
	if (n >= MAX_DEMOS_PER_SONG) return "full" as const;
	const id = nanoid();
	const [row] = await db
		.insert(demo)
		.values({
			id,
			accountId,
			songId,
			label: labelFromFilename(file.filename),
			url: "",
			pathname: demoPathname(accountId, songId, id, file.filename),
			filename: file.filename,
			contentType: file.contentType,
			sizeBytes: file.sizeBytes,
			uploadedBy: userId,
		})
		.returning();
	return row;
}

export function findUploadingDemo(accountId: string, pathname: string) {
	return db.query.demo.findFirst({
		where: and(
			eq(demo.accountId, accountId),
			eq(demo.pathname, pathname),
			eq(demo.status, "uploading"),
		),
	});
}

/** Step 3: the browser reports the blob URL; the row becomes ready. */
export async function markDemoReady(accountId: string, demoId: string, url: string) {
	const [row] = await db
		.update(demo)
		.set({ status: "ready", url })
		.where(and(eq(demo.accountId, accountId), eq(demo.id, demoId)))
		.returning({ id: demo.id });
	return row ?? null;
}

/** Production backstop from Vercel's completion webhook. */
export async function recordDemoUrl(pathname: string, url: string) {
	await db
		.update(demo)
		.set({ url, status: "ready" })
		.where(and(eq(demo.pathname, pathname), eq(demo.status, "uploading")));
}

export async function deleteDemo(accountId: string, demoId: string) {
	const [row] = await db
		.delete(demo)
		.where(and(eq(demo.accountId, accountId), eq(demo.id, demoId)))
		.returning({ url: demo.url, playbackUrl: demo.playbackUrl });
	if (!row) return false;
	await deleteBlobs([row.url, row.playbackUrl ?? ""]);
	return true;
}

/** Which of a song's ready demos still want an MP3 (same rules as stems' renditions). */
export function demosWantingPlayback(
	demos: {
		id: string;
		status: string;
		url: string;
		playbackStatus: PlaybackStatus | null;
		playbackStartedAt: Date | null;
	}[],
	now = Date.now(),
) {
	return stemsWantingPlayback(demos, now);
}

export async function claimDemoPlayback(demoId: string) {
	const now = new Date();
	const [row] = await db
		.update(demo)
		.set({ playbackStatus: "pending", playbackStartedAt: now })
		.where(
			and(
				eq(demo.id, demoId),
				eq(demo.status, "ready"),
				sql`(${demo.playbackStatus} is null
					or (${demo.playbackStatus} = 'failed' and ${demo.playbackStartedAt} < ${now.getTime() - PLAYBACK_RETRY_MS})
					or (${demo.playbackStatus} = 'pending' and ${demo.playbackStartedAt} < ${now.getTime() - PLAYBACK_STALE_MS}))`,
			),
		)
		.returning({
			id: demo.id,
			url: demo.url,
			pathname: demo.pathname,
			playbackUrl: demo.playbackUrl,
		});
	return row ?? null;
}

export async function finishDemoPlayback(
	demoId: string,
	r: { url: string; pathname: string; bytes: number },
) {
	await db
		.update(demo)
		.set({
			playbackStatus: "ready",
			playbackUrl: r.url,
			playbackPathname: r.pathname,
			playbackBytes: r.bytes,
		})
		.where(eq(demo.id, demoId));
}

export async function failDemoPlayback(demoId: string) {
	await db.update(demo).set({ playbackStatus: "failed" }).where(eq(demo.id, demoId));
}

// ---- mixdowns (see src/lib/server/mix.ts) ---------------------------------

/** A song with its ready stems and the names a mix file needs, by id (public: viewing needs no member). */
export async function songForMix(songId: string) {
	const row = await db.query.song.findFirst({
		where: eq(song.id, songId),
		columns: {
			id: true,
			accountId: true,
			title: true,
			slug: true,
			mixUrl: true,
			mixKey: true,
			mixStartedAt: true,
		},
		with: {
			project: { columns: { slug: true }, with: { account: { columns: { name: true } } } },
			stems: {
				columns: {
					id: true,
					status: true,
					url: true,
					channels: true,
					playbackStatus: true,
					playbackUrl: true,
				},
				orderBy: [asc(stem.sortOrder)],
			},
		},
	});
	if (!row) return null;
	return { ...row, stems: row.stems.filter((s) => s.status === "ready" && s.url) };
}

export async function setSongMix(songId: string, mix: { url: string; key: string } | null) {
	await db
		.update(song)
		.set({ mixUrl: mix?.url ?? null, mixKey: mix?.key ?? null, mixStartedAt: null })
		.where(eq(song.id, songId));
}

const MIX_STALE_MS = 15 * 60 * 1000;

/**
 * Takes the song for a background mix render: true when its cached mix is
 * not `key` and no other render holds it (a hold older than MIX_STALE_MS is
 * presumed crashed). The update is the lock.
 */
export async function claimSongMix(songId: string, key: string) {
	const now = Date.now();
	const rows = await db
		.update(song)
		.set({ mixStartedAt: new Date(now) })
		.where(
			and(
				eq(song.id, songId),
				sql`(${song.mixKey} is null or ${song.mixKey} != ${key} or ${song.mixUrl} is null)`,
				sql`(${song.mixStartedAt} is null or ${song.mixStartedAt} < ${now - MIX_STALE_MS})`,
			),
		)
		.returning({ id: song.id });
	return rows.length > 0;
}

export async function releaseSongMix(songId: string) {
	await db.update(song).set({ mixStartedAt: null }).where(eq(song.id, songId));
}

/** Ids of songs whose cached mix does not match their current stems (for page-load backstops). */
export function songsWantingMix(
	songs: {
		id: string;
		mixKey: string | null;
		mixUrl: string | null;
		stems: {
			id: string;
			status: string;
			url: string;
			playbackStatus: PlaybackStatus | null;
			playbackUrl: string | null;
		}[];
	}[],
	keyOf: (stems: (typeof songs)[number]["stems"]) => string,
) {
	return songs
		.filter((s) => s.stems.some((st) => st.status === "ready" && st.url))
		.filter(
			(s) =>
				!s.mixUrl || s.mixKey !== keyOf(s.stems.filter((st) => st.status === "ready" && st.url)),
		)
		.map((s) => s.id);
}

// ---- playback renditions (see src/lib/server/transcode.ts) ----------------

const NO_PLAYBACK = {
	playbackStatus: null,
	playbackUrl: null,
	playbackPathname: null,
	playbackBytes: null,
	playbackStartedAt: null,
};

/** A failed render is retried after this; a "pending" older than this is presumed crashed. */
const PLAYBACK_RETRY_MS = 60 * 60 * 1000;
const PLAYBACK_STALE_MS = 15 * 60 * 1000;

/** Which of a song's ready stems still want a rendition (never tried, failed a while ago, or stuck). */
export function stemsWantingPlayback(
	stems: {
		id: string;
		status: string;
		url: string;
		playbackStatus: PlaybackStatus | null;
		playbackStartedAt: Date | null;
	}[],
	now = Date.now(),
) {
	return stems
		.filter((s) => s.status === "ready" && s.url)
		.filter((s) => {
			const age = now - (s.playbackStartedAt?.getTime() ?? 0);
			if (s.playbackStatus === null) return true;
			if (s.playbackStatus === "failed") return age > PLAYBACK_RETRY_MS;
			if (s.playbackStatus === "pending") return age > PLAYBACK_STALE_MS;
			return false;
		})
		.map((s) => s.id);
}

/**
 * Marks a stem "pending" and returns what the transcoder needs, or null when
 * another request already claimed it (the update is the lock).
 */
export async function claimPlayback(stemId: string) {
	const now = new Date();
	const [row] = await db
		.update(stem)
		.set({ playbackStatus: "pending", playbackStartedAt: now })
		.where(
			and(
				eq(stem.id, stemId),
				eq(stem.status, "ready"),
				sql`(${stem.playbackStatus} is null
					or (${stem.playbackStatus} = 'failed' and ${stem.playbackStartedAt} < ${now.getTime() - PLAYBACK_RETRY_MS})
					or (${stem.playbackStatus} = 'pending' and ${stem.playbackStartedAt} < ${now.getTime() - PLAYBACK_STALE_MS}))`,
			),
		)
		.returning({
			id: stem.id,
			songId: stem.songId,
			url: stem.url,
			pathname: stem.pathname,
			channels: stem.channels,
			playbackUrl: stem.playbackUrl,
		});
	return row ?? null;
}

export async function finishPlayback(
	stemId: string,
	r: { url: string; pathname: string; bytes: number },
) {
	await db
		.update(stem)
		.set({
			playbackStatus: "ready",
			playbackUrl: r.url,
			playbackPathname: r.pathname,
			playbackBytes: r.bytes,
		})
		.where(eq(stem.id, stemId));
}

export async function failPlayback(stemId: string) {
	await db.update(stem).set({ playbackStatus: "failed" }).where(eq(stem.id, stemId));
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

// ---- song documents: chart, lyrics, notes --------------------------------

const DOC_VERSIONS_TO_KEEP = 10;
/** Blanking a document longer than this needs `confirmEmpty` (accidental-wipe guard). */
const DOC_WIPE_GUARD_CHARS = 200;

const DOC_COLUMNS = {
	chart: { markdown: "chartMarkdown", hash: "chartHash", version: "chartVersion" },
	lyrics: { markdown: "lyricsMarkdown", hash: "lyricsHash", version: "lyricsVersion" },
	notes: { markdown: "notesMarkdown", hash: "notesHash", version: "notesVersion" },
} as const;

export type SaveDocResult =
	| { ok: true; version: number; changed: boolean }
	| { ok: false; error: string; needsConfirm?: boolean };

/** The markdown of one document, for pages that need only that. */
export function docText(
	s: { chartMarkdown: string; lyricsMarkdown: string; notesMarkdown: string },
	kind: SongDocKind,
) {
	return s[DOC_COLUMNS[kind].markdown];
}

export function docVersion(
	s: { chartVersion: number; lyricsVersion: number; notesVersion: number },
	kind: SongDocKind,
) {
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
