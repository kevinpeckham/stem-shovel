import type { StemManifest } from "$lib/audio/types";
import { deleteBlobs, demoPathname, midiPathname, stemPathname } from "$lib/server/blob";
import { db, schema } from "$lib/server/db";
import { barGrid } from "$lib/audio/measures";
import { hashMarkdown } from "$lib/server/markdown";
import { labelFromFilename } from "$lib/utils/labelFromFilename";
import { MAX_DEMOS_PER_SONG } from "$lib/constants/demoFormats";
import { MAX_STEMS_PER_SONG } from "$lib/constants/stemFormats";
import { slugify } from "$lib/utils/slugify";
import { SlugSchema } from "$lib/val/SlugSchema";
import type { PlaybackStatus } from "$lib/val/PlaybackStatusSchema";
import type { SongDocKind } from "$lib/val/SongDocKindSchema";
import type { SongChange } from "$lib/val/SongChangeSchema";
import type { SongSection } from "$lib/val/SongSectionSchema";
import type { MemberRole } from "$lib/val/MemberRoleSchema";
import { INVITATION_TTL_MS, type InviteRole } from "$lib/val/InvitationSchema";
import { INVITE_CODE_ALPHABET, INVITE_CODE_LENGTH } from "$lib/val/InviteCodeSchema";
import type { BugStatus } from "$lib/val/BugReportSchema";
import type { AccountStatus } from "$lib/val/AccountStatusSchema";
import type { ShareGrant } from "$lib/server/viewAccess";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { customAlphabet, nanoid } from "nanoid";
import * as v from "valibot";

/**
 * Every function takes the caller's accountId first and scopes by it, so a
 * row from another tenant is simply "not found". Callers get it from the
 * URL's [account] (checked against locals.memberships) or from the entity's
 * own account via src/lib/server/access.ts.
 */

const {
	account,
	accountMember,
	project,
	song,
	stem,
	songDocVersion,
	demo,
	invitation,
	inviteCode,
	comment,
	bugReport,
	userDoc,
	userDocVersion,
	shareLink,
} = schema;

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
			userId: m.userId,
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
					demos: { columns: { id: true, status: true } },
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
		frameRate: string;
		version: string;
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
			startAt: input.startAt ? Number(input.startAt) : null,
			endAt: input.endAt ? Number(input.endAt) : null,
			frameRate: Number(input.frameRate),
			version: input.version,
		})
		.where(eq(song.id, songId))
		.returning();
	return { ok: true, song: row };
}

export async function getSong(accountId: string, projectSlug: string, songSlug: string) {
	const proj = await db.query.project.findFirst({
		where: and(eq(project.accountId, accountId), eq(project.slug, projectSlug)),
		columns: { id: true, name: true, slug: true, isPrivate: true },
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
		.select({ url: stem.url, playbackUrl: stem.playbackUrl, midiUrl: stem.midiUrl })
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
		...rows.flatMap((r) => [r.url, r.playbackUrl ?? "", r.midiUrl ?? ""]),
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
	if (row) await stemsChanged(row.songId);
	return row ?? null;
}

/** A stem was added, replaced or removed: refresh the song's length and stamp `stemsUpdatedAt`. */
async function stemsChanged(songId: string) {
	await refreshSongDuration(songId);
	await db.update(song).set({ stemsUpdatedAt: new Date() }).where(eq(song.id, songId));
}

/** Sets the song's user-managed version ("1.2.3"). */
export async function setSongVersion(accountId: string, songId: string, version: string) {
	const [row] = await db
		.update(song)
		.set({ version })
		.where(and(eq(song.accountId, accountId), eq(song.id, songId)))
		.returning({ version: song.version });
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
		.returning({
			url: stem.url,
			playbackUrl: stem.playbackUrl,
			midiUrl: stem.midiUrl,
			songId: stem.songId,
		});
	if (!row) return null;
	await deleteBlobs([row.url, row.playbackUrl ?? "", row.midiUrl ?? ""]);
	await stemsChanged(row.songId);
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
		.map((s) => ({
			index: (s.index ?? "").trim(),
			name: s.name.trim(),
			start: Math.round(s.start * 10_000) / 10_000, // a tenth of a millisecond: finer than a Logic subframe
		}))
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
		.map((c) => ({
			kind: c.kind,
			start: Math.round(c.start * 10_000) / 10_000,
			value: c.value.trim(),
		}))
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

// ---- comments ---------------------------------------------------------------

/** What parsePosition needs to read a typed position for this song. */
export async function songGrid(songId: string) {
	const s = await db.query.song.findFirst({
		where: eq(song.id, songId),
		columns: { changes: true, startAt: true, frameRate: true },
	});
	return s ? { fps: s.frameRate, grid: barGrid(s.changes, s.startAt) } : null;
}

export interface CommentInput {
	title: string;
	body: string;
	at: number | null;
}

/** A song's comments, oldest first, with who wrote them. */
export async function listComments(songId: string) {
	const rows = await db.query.comment.findMany({
		where: eq(comment.songId, songId),
		orderBy: [asc(comment.createdAt)],
		with: { author: { columns: { id: true, name: true } } },
	});
	return rows.map((c) => ({
		id: c.id,
		userId: c.userId,
		authorName: c.author.name,
		title: c.title,
		body: c.body,
		at: c.at,
		createdAt: c.createdAt,
		editedAt: c.editedAt,
	}));
}

export async function createComment(
	accountId: string,
	songId: string,
	userId: string,
	input: CommentInput,
) {
	const s = await db.query.song.findFirst({
		where: and(eq(song.accountId, accountId), eq(song.id, songId)),
		columns: { id: true },
	});
	if (!s) return null;
	const [row] = await db
		.insert(comment)
		.values({ accountId, songId, userId, title: input.title, body: input.body, at: input.at })
		.returning({ id: comment.id });
	return row;
}

/** The comment's account and author, for permission checks. */
export async function commentOwnership(id: string) {
	return db.query.comment.findFirst({
		where: eq(comment.id, id),
		columns: { id: true, accountId: true, userId: true, songId: true },
	});
}

/** Edits a comment (the caller has checked it is theirs); stamps editedAt. */
export async function updateComment(id: string, input: CommentInput) {
	const [row] = await db
		.update(comment)
		.set({ title: input.title, body: input.body, at: input.at, editedAt: new Date() })
		.where(eq(comment.id, id))
		.returning({ id: comment.id });
	return row ?? null;
}

export async function deleteComment(id: string) {
	const [row] = await db.delete(comment).where(eq(comment.id, id)).returning({ id: comment.id });
	return !!row;
}

// ---- invitations ------------------------------------------------------------

/** A pending invitation for `email` into the account, or a fresh one; the token is the link. */
export async function createInvitation(
	accountId: string,
	invitedBy: string,
	email: string,
	role: MemberRole,
) {
	const address = email.trim().toLowerCase();
	const members = await db.query.accountMember.findMany({
		where: eq(accountMember.accountId, accountId),
		with: { user: { columns: { email: true } } },
	});
	if (members.some((m) => m.user.email.toLowerCase() === address)) return "member" as const;
	const [row] = await db
		.insert(invitation)
		.values({
			accountId,
			email: address,
			role,
			token: nanoid(32),
			invitedBy,
			expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
		})
		.returning();
	return row;
}

/** Open invitations for the settings page. */
export function pendingInvitations(accountId: string) {
	return db.query.invitation.findMany({
		where: and(
			eq(invitation.accountId, accountId),
			isNull(invitation.acceptedAt),
			isNull(invitation.revokedAt),
		),
		orderBy: [desc(invitation.createdAt)],
		columns: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
	});
}

export async function revokeInvitation(accountId: string, id: string) {
	const [row] = await db
		.update(invitation)
		.set({ revokedAt: new Date() })
		.where(
			and(
				eq(invitation.accountId, accountId),
				eq(invitation.id, id),
				isNull(invitation.acceptedAt),
			),
		)
		.returning({ id: invitation.id });
	return !!row;
}

/** The invitation behind a link, with its account, or why it cannot be used. */
export async function invitationByToken(token: string) {
	const row = await db.query.invitation.findFirst({
		where: eq(invitation.token, token),
		with: { account: { columns: { id: true, name: true, slug: true } } },
	});
	if (!row) return { status: "missing" as const };
	if (row.acceptedAt) return { status: "accepted" as const, invitation: row };
	if (row.revokedAt) return { status: "revoked" as const, invitation: row };
	if (row.expiresAt.getTime() < Date.now()) return { status: "expired" as const, invitation: row };
	return { status: "open" as const, invitation: row };
}

/** Joins the account: the invitee's address must match the invitation's. */
export async function acceptInvitation(token: string, user: { id: string; email: string }) {
	const found = await invitationByToken(token);
	if (found.status !== "open") return found.status;
	const inv = found.invitation;
	if (inv.email !== user.email.toLowerCase()) return "mismatch" as const;
	const existing = await db.query.accountMember.findFirst({
		where: and(eq(accountMember.accountId, inv.accountId), eq(accountMember.userId, user.id)),
	});
	if (!existing) {
		await db
			.insert(accountMember)
			.values({ accountId: inv.accountId, userId: user.id, role: inv.role });
	}
	await db.update(invitation).set({ acceptedAt: new Date() }).where(eq(invitation.id, inv.id));
	return { status: "joined" as const, account: inv.account };
}

// ---- invite codes -----------------------------------------------------------

const newCode = customAlphabet(INVITE_CODE_ALPHABET, INVITE_CODE_LENGTH);

/** `accountId` null = a system code that only opens sign-up (no account to join). */
export async function createInviteCode(
	accountId: string | null,
	createdBy: string,
	opts: { role: InviteRole; note: string; maxUses: number | null; expiresDays: number },
) {
	const [row] = await db
		.insert(inviteCode)
		.values({
			accountId,
			code: newCode(),
			role: opts.role,
			note: opts.note,
			createdBy,
			maxUses: opts.maxUses,
			expiresAt: opts.expiresDays > 0 ? new Date(Date.now() + opts.expiresDays * 86_400_000) : null,
		})
		.returning();
	return row;
}

/** Every code the account has issued, newest first, with whether it still works. */
export async function listInviteCodes(accountId: string | null) {
	const rows = await db.query.inviteCode.findMany({
		where: accountId === null ? isNull(inviteCode.accountId) : eq(inviteCode.accountId, accountId),
		orderBy: [desc(inviteCode.createdAt)],
		with: { creator: { columns: { name: true } } },
	});
	return rows.map((r) => ({ ...r, state: inviteCodeState(r) }));
}

type InviteCodeRow = typeof inviteCode.$inferSelect;

function inviteCodeState(r: InviteCodeRow) {
	if (r.revokedAt) return "revoked" as const;
	if (r.expiresAt && r.expiresAt.getTime() < Date.now()) return "expired" as const;
	if (r.maxUses !== null && r.uses >= r.maxUses) return "used up" as const;
	return "open" as const;
}

export async function revokeInviteCode(accountId: string | null, id: string) {
	const [row] = await db
		.update(inviteCode)
		.set({ revokedAt: new Date() })
		.where(
			and(
				accountId === null ? isNull(inviteCode.accountId) : eq(inviteCode.accountId, accountId),
				eq(inviteCode.id, id),
			),
		)
		.returning({ id: inviteCode.id });
	return !!row;
}

/** The code someone typed (already normalised), with its account, or why it cannot be used. */
export async function inviteCodeByCode(code: string) {
	const row = await db.query.inviteCode.findFirst({
		where: eq(inviteCode.code, code),
		with: { account: { columns: { id: true, name: true, slug: true } } },
	});
	if (!row) return { status: "missing" as const };
	return { status: inviteCodeState(row), code: row };
}

/** Joins the code's account and counts the use. */
export async function redeemInviteCode(code: string, userId: string) {
	const found = await inviteCodeByCode(code);
	if (found.status !== "open") return found.status;
	const row = found.code;
	// A system code (no account) only opens sign-up; the personal workspace is made by auth.ts.
	if (row.accountId) {
		const existing = await db.query.accountMember.findFirst({
			where: and(eq(accountMember.accountId, row.accountId), eq(accountMember.userId, userId)),
		});
		if (!existing) {
			await db.insert(accountMember).values({ accountId: row.accountId, userId, role: row.role });
		}
	}
	await db
		.update(inviteCode)
		.set({ uses: sql`${inviteCode.uses} + 1` })
		.where(eq(inviteCode.id, row.id));
	return { status: "joined" as const, account: row.account };
}

// ---- system admin -----------------------------------------------------------

/** Every account with its size, and every user, for /admin. */
export async function systemOverview() {
	const accounts = await db.query.account.findMany({
		orderBy: [asc(account.name)],
		with: { members: { with: { user: { columns: { name: true, email: true } } } } },
	});
	const counts = await db
		.select({ accountId: song.accountId, songs: sql<number>`count(*)` })
		.from(song)
		.groupBy(song.accountId);
	const storage = await db
		.select({ accountId: stem.accountId, bytes: sql<number | null>`sum(${stem.sizeBytes})` })
		.from(stem)
		.where(eq(stem.status, "ready"))
		.groupBy(stem.accountId);
	const songsOf = new Map(counts.map((c) => [c.accountId, c.songs]));
	const bytesOf = new Map(storage.map((b) => [b.accountId, b.bytes ?? 0]));
	const users = await db.query.user.findMany({
		orderBy: [asc(schema.user.name)],
		columns: {
			id: true,
			name: true,
			email: true,
			emailVerified: true,
			isActive: true,
			isSystemAdmin: true,
			createdAt: true,
		},
	});
	const rolesOf = new Map<string, { account: string; slug: string; role: string }[]>();
	for (const a of accounts) {
		for (const m of a.members) {
			const list = rolesOf.get(m.userId) ?? [];
			list.push({ account: a.name, slug: a.slug, role: m.role });
			rolesOf.set(m.userId, list);
		}
	}
	return {
		accounts: accounts.map((a) => ({
			id: a.id,
			name: a.name,
			slug: a.slug,
			status: a.status,
			createdAt: a.createdAt,
			songs: songsOf.get(a.id) ?? 0,
			bytes: bytesOf.get(a.id) ?? 0,
			members: a.members.map((m) => ({ role: m.role, name: m.user.name, email: m.user.email })),
		})),
		users: users.map((u) => ({ ...u, memberships: rolesOf.get(u.id) ?? [] })),
	};
}

// ---- bug reports ------------------------------------------------------------

export async function createBugReport(
	userId: string,
	input: { title: string; body: string; pageUrl: string; userAgent: string },
) {
	const [row] = await db
		.insert(bugReport)
		.values({ userId, ...input })
		.returning();
	return row;
}

/** Newest first, open ones before closed, with who reported each. */
export function listBugReports() {
	return db.query.bugReport.findMany({
		orderBy: [asc(bugReport.status), desc(bugReport.createdAt)],
		with: { reporter: { columns: { name: true, email: true } } },
	});
}

export async function setBugReportStatus(id: string, status: BugStatus) {
	const [row] = await db
		.update(bugReport)
		.set({ status, closedAt: status === "closed" ? new Date() : null })
		.where(eq(bugReport.id, id))
		.returning({ id: bugReport.id });
	return !!row;
}

/** Who hears about new bug reports. */
export async function systemAdminEmails() {
	const rows = await db.query.user.findMany({
		where: and(eq(schema.user.isSystemAdmin, true), eq(schema.user.isActive, true)),
		columns: { email: true },
	});
	return rows.map((r) => r.email);
}

// ---- user docs --------------------------------------------------------------

/** Every page, in reading order, without the markdown. */
export function listUserDocs() {
	return db.query.userDoc.findMany({
		orderBy: [asc(userDoc.sortOrder), asc(userDoc.title)],
		columns: { id: true, slug: true, title: true, sortOrder: true, version: true, updatedAt: true },
	});
}

export function getUserDoc(slug: string) {
	return db.query.userDoc.findFirst({
		where: eq(userDoc.slug, slug),
		with: { editor: { columns: { name: true } } },
	});
}

export async function createUserDoc(userId: string, title: string) {
	const taken = new Set((await db.select({ slug: userDoc.slug }).from(userDoc)).map((r) => r.slug));
	const [row] = await db
		.insert(userDoc)
		.values({ title, slug: uniqueSlug(slugify(title) || "page", taken), updatedBy: userId })
		.returning();
	return row;
}

export async function updateUserDocMeta(
	id: string,
	meta: { title: string; slug: string; sortOrder: number },
) {
	const clash = await db.query.userDoc.findFirst({ where: eq(userDoc.slug, meta.slug) });
	if (clash && clash.id !== id)
		return { ok: false as const, error: "Another page has that address." };
	const [row] = await db.update(userDoc).set(meta).where(eq(userDoc.id, id)).returning();
	return row ? { ok: true as const, doc: row } : { ok: false as const, error: "Page not found." };
}

export async function deleteUserDoc(id: string) {
	const [row] = await db.delete(userDoc).where(eq(userDoc.id, id)).returning({ id: userDoc.id });
	return !!row;
}

/** Same rules as saveSongDoc: wipe guard, hash-gated versions, the newest DOC_VERSIONS_TO_KEEP kept. */
export async function saveUserDoc(
	id: string,
	userId: string,
	markdown: string,
	opts: { confirmEmpty?: boolean } = {},
): Promise<SaveDocResult> {
	const existing = await db.query.userDoc.findFirst({ where: eq(userDoc.id, id) });
	if (!existing) return { ok: false, error: "Page not found." };
	const next = markdown.replace(/\r\n/g, "\n");
	if (
		next.trim() === "" &&
		existing.markdown.trim().length > DOC_WIPE_GUARD_CHARS &&
		!opts.confirmEmpty
	) {
		return {
			ok: false,
			needsConfirm: true,
			error: "This would empty the page while it has content. Save again to confirm.",
		};
	}
	const contentHash = await hashMarkdown(next);
	if (contentHash === existing.contentHash) {
		return { ok: true, version: existing.version, changed: false };
	}
	const versionNumber = existing.version + 1;
	await db.insert(userDocVersion).values({
		docId: id,
		versionNumber,
		markdown: next,
		contentHash,
		createdBy: userId,
	});
	await db
		.update(userDoc)
		.set({ markdown: next, contentHash, version: versionNumber, updatedBy: userId })
		.where(eq(userDoc.id, id));
	const stale = await db
		.select({ id: userDocVersion.id })
		.from(userDocVersion)
		.where(eq(userDocVersion.docId, id))
		.orderBy(desc(userDocVersion.versionNumber))
		.limit(1000)
		.offset(DOC_VERSIONS_TO_KEEP);
	if (stale.length > 0) {
		await db.delete(userDocVersion).where(
			inArray(
				userDocVersion.id,
				stale.map((r) => r.id),
			),
		);
	}
	return { ok: true, version: versionNumber, changed: true };
}

/** Suspending signs the user out everywhere; reactivating just lifts the flag. */
export async function setUserActive(id: string, active: boolean) {
	const [row] = await db
		.update(schema.user)
		.set({ isActive: active })
		.where(eq(schema.user.id, id))
		.returning({ id: schema.user.id });
	if (row && !active) await db.delete(schema.session).where(eq(schema.session.userId, id));
	return !!row;
}

/**
 * Removes the user (sessions, sign-in methods, memberships and comments go
 * with them). An account they were the last member of is deleted too when
 * it holds no projects; one with content is kept, member-less, so nothing
 * with stems disappears by accident.
 */
export async function deleteUser(id: string) {
	const memberships = await db.query.accountMember.findMany({
		where: eq(accountMember.userId, id),
		columns: { accountId: true },
	});
	const [row] = await db
		.delete(schema.user)
		.where(eq(schema.user.id, id))
		.returning({ id: schema.user.id });
	if (!row) return null;
	let accountsRemoved = 0;
	for (const { accountId } of memberships) {
		const left = await db.query.accountMember.findFirst({
			where: eq(accountMember.accountId, accountId),
		});
		if (left) continue;
		const content = await db.query.project.findFirst({ where: eq(project.accountId, accountId) });
		if (content) continue;
		await db.delete(account).where(eq(account.id, accountId));
		accountsRemoved += 1;
	}
	return { accountsRemoved };
}

// ---- privacy and share links ------------------------------------------------

export async function setProjectPrivacy(accountId: string, id: string, isPrivate: boolean) {
	const [row] = await db
		.update(project)
		.set({ isPrivate })
		.where(and(eq(project.accountId, accountId), eq(project.id, id)))
		.returning({ id: project.id });
	return !!row;
}

export async function setSongPrivacy(accountId: string, id: string, isPrivate: boolean) {
	const [row] = await db
		.update(song)
		.set({ isPrivate })
		.where(and(eq(song.accountId, accountId), eq(song.id, id)))
		.returning({ id: song.id });
	return !!row;
}

export async function createShareLink(
	accountId: string,
	createdBy: string,
	target: { songId?: string; projectId?: string },
	opts: { note: string; maxUses: number | null; expiresDays: number },
) {
	const [row] = await db
		.insert(shareLink)
		.values({
			accountId,
			songId: target.songId ?? null,
			projectId: target.projectId ?? null,
			code: newCode(),
			note: opts.note,
			createdBy,
			maxUses: opts.maxUses,
			expiresAt: opts.expiresDays > 0 ? new Date(Date.now() + opts.expiresDays * 86_400_000) : null,
		})
		.returning();
	return row;
}

type ShareLinkRow = typeof shareLink.$inferSelect;

function shareLinkState(r: ShareLinkRow) {
	if (r.revokedAt) return "revoked" as const;
	if (r.expiresAt && r.expiresAt.getTime() < Date.now()) return "expired" as const;
	if (r.maxUses !== null && r.uses >= r.maxUses) return "used up" as const;
	return "open" as const;
}

/** The links made for one song or one project, newest first, with whether each still works. */
export async function listShareLinks(target: { songId: string } | { projectId: string }) {
	const rows = await db.query.shareLink.findMany({
		where:
			"songId" in target
				? eq(shareLink.songId, target.songId)
				: eq(shareLink.projectId, target.projectId),
		orderBy: [desc(shareLink.createdAt)],
		with: { creator: { columns: { name: true } } },
	});
	return rows.map((r) => ({ ...r, state: shareLinkState(r) }));
}

export async function revokeShareLink(accountId: string, id: string) {
	const [row] = await db
		.update(shareLink)
		.set({ revokedAt: new Date() })
		.where(and(eq(shareLink.accountId, accountId), eq(shareLink.id, id)))
		.returning({ id: shareLink.id });
	return !!row;
}

/** Which of the codes a visitor carries are open, and what each opens. */
export async function openShareLinks(codes: string[]): Promise<ShareGrant[]> {
	if (codes.length === 0) return [];
	const rows = await db.query.shareLink.findMany({ where: inArray(shareLink.code, codes) });
	return rows
		.filter((r) => shareLinkState(r) === "open")
		.map((r) => ({ code: r.code, projectId: r.projectId, songId: r.songId }));
}

/** A visitor arrived with the code: count the use. */
export async function useShareLink(code: string) {
	await db
		.update(shareLink)
		.set({ uses: sql`${shareLink.uses} + 1` })
		.where(eq(shareLink.code, code));
}

export async function setAccountStatus(id: string, status: AccountStatus) {
	const [row] = await db
		.update(account)
		.set({ status })
		.where(eq(account.id, id))
		.returning({ id: account.id });
	return !!row;
}

/** Removes the account and everything in it, files included (stems, renditions, MIDI, demos, mixes). */
export async function deleteAccount(id: string) {
	const stems = await db
		.select({ url: stem.url, playbackUrl: stem.playbackUrl, midiUrl: stem.midiUrl })
		.from(stem)
		.where(eq(stem.accountId, id));
	const demos = await db
		.select({ url: demo.url, playbackUrl: demo.playbackUrl })
		.from(demo)
		.where(eq(demo.accountId, id));
	const mixes = await db.select({ mixUrl: song.mixUrl }).from(song).where(eq(song.accountId, id));
	await deleteBlobs([
		...stems.flatMap((r) => [r.url, r.playbackUrl ?? "", r.midiUrl ?? ""]),
		...demos.flatMap((d) => [d.url, d.playbackUrl ?? ""]),
		...mixes.map((m) => m.mixUrl ?? ""),
	]);
	const [row] = await db.delete(account).where(eq(account.id, id)).returning({ id: account.id });
	return !!row;
}

// ---- memberships ------------------------------------------------------------

/** Every account the user belongs to, with their role and the account's size, for /accounts. */
export async function accountsOf(userId: string) {
	const rows = await db.query.accountMember.findMany({
		where: eq(accountMember.userId, userId),
		with: {
			account: { columns: { id: true, name: true, slug: true, status: true, createdAt: true } },
		},
	});
	const counts = await db
		.select({ accountId: project.accountId, n: sql<number>`count(*)` })
		.from(project)
		.where(eq(project.status, "active"))
		.groupBy(project.accountId);
	const projectsOf = new Map(counts.map((c) => [c.accountId, c.n]));
	const owners = await db
		.select({ accountId: accountMember.accountId, n: sql<number>`count(*)` })
		.from(accountMember)
		.where(eq(accountMember.role, "owner"))
		.groupBy(accountMember.accountId);
	const ownersOf = new Map(owners.map((o) => [o.accountId, o.n]));
	return rows
		.map((m) => ({
			accountId: m.accountId,
			name: m.account.name,
			slug: m.account.slug,
			status: m.account.status,
			role: m.role,
			projects: projectsOf.get(m.accountId) ?? 0,
			/** An owner may leave only when another owner remains. */
			canLeave: m.role !== "owner" || (ownersOf.get(m.accountId) ?? 0) > 1,
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
}

async function ownerCount(accountId: string) {
	const [row] = await db
		.select({ n: sql<number>`count(*)` })
		.from(accountMember)
		.where(and(eq(accountMember.accountId, accountId), eq(accountMember.role, "owner")));
	return row?.n ?? 0;
}

/** Ends a membership; the last owner cannot go. */
export async function removeMembership(accountId: string, userId: string) {
	const m = await db.query.accountMember.findFirst({
		where: and(eq(accountMember.accountId, accountId), eq(accountMember.userId, userId)),
	});
	if (!m) return { ok: false as const, error: "Not a member." };
	if (m.role === "owner" && (await ownerCount(accountId)) <= 1) {
		return {
			ok: false as const,
			error: "The last owner cannot leave. Make someone else an owner first.",
		};
	}
	await db.delete(accountMember).where(eq(accountMember.id, m.id));
	return { ok: true as const, role: m.role };
}

/** Changes a member's role; the last owner cannot be demoted. */
export async function setMemberRole(accountId: string, userId: string, role: MemberRole) {
	const m = await db.query.accountMember.findFirst({
		where: and(eq(accountMember.accountId, accountId), eq(accountMember.userId, userId)),
	});
	if (!m) return { ok: false as const, error: "Not a member." };
	if (m.role === "owner" && role !== "owner" && (await ownerCount(accountId)) <= 1) {
		return {
			ok: false as const,
			error: "The last owner cannot be demoted. Make someone else an owner first.",
		};
	}
	await db.update(accountMember).set({ role }).where(eq(accountMember.id, m.id));
	return { ok: true as const, previous: m.role };
}

// ---- stem MIDI files --------------------------------------------------------

/** Step 1 of a MIDI upload: reserve the pathname on the stem (the previous file, if any, stays until the new one lands). */
export async function reserveStemMidi(accountId: string, stemId: string, file: NewStemFile) {
	const existing = await db.query.stem.findFirst({
		where: and(eq(stem.accountId, accountId), eq(stem.id, stemId)),
		columns: { id: true, songId: true },
	});
	if (!existing) return null;
	const pathname = midiPathname(accountId, existing.songId, stemId, file.filename);
	await db
		.update(stem)
		.set({ midiPathname: pathname, midiFilename: file.filename, midiSizeBytes: file.sizeBytes })
		.where(eq(stem.id, stemId));
	return { stemId, pathname, contentType: file.contentType };
}

/** Step 2: the pathname must be a reserved MIDI upload. */
export function findStemByMidiPathname(accountId: string, pathname: string) {
	return db.query.stem.findFirst({
		where: and(eq(stem.accountId, accountId), eq(stem.midiPathname, pathname)),
		columns: { id: true, midiFilename: true },
	});
}

/** Step 3: the file landed; swap the URL in and drop the previous file. */
export async function markStemMidiReady(accountId: string, stemId: string, url: string) {
	const before = await db.query.stem.findFirst({
		where: and(eq(stem.accountId, accountId), eq(stem.id, stemId)),
		columns: { midiUrl: true },
	});
	if (!before) return null;
	await db.update(stem).set({ midiUrl: url }).where(eq(stem.id, stemId));
	if (before.midiUrl && before.midiUrl !== url) await deleteBlobs([before.midiUrl]);
	return { stemId };
}

/** Production backstop from Vercel's completion webhook. */
export async function recordStemMidiUrl(pathname: string, url: string) {
	const row = await db.query.stem.findFirst({
		where: eq(stem.midiPathname, pathname),
		columns: { midiUrl: true, id: true },
	});
	if (!row || row.midiUrl === url) return;
	await db.update(stem).set({ midiUrl: url }).where(eq(stem.id, row.id));
	if (row.midiUrl) await deleteBlobs([row.midiUrl]);
}

export async function removeStemMidi(accountId: string, stemId: string) {
	const before = await db.query.stem.findFirst({
		where: and(eq(stem.accountId, accountId), eq(stem.id, stemId)),
		columns: { midiUrl: true },
	});
	if (!before) return false;
	await db
		.update(stem)
		.set({ midiUrl: null, midiPathname: null, midiFilename: null, midiSizeBytes: null })
		.where(eq(stem.id, stemId));
	if (before.midiUrl) await deleteBlobs([before.midiUrl]);
	return true;
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
			projectId: true,
			isPrivate: true,
			title: true,
			slug: true,
			mixUrl: true,
			mixKey: true,
			mixStartedAt: true,
		},
		with: {
			project: {
				columns: { slug: true, name: true, isPrivate: true },
				with: { account: { columns: { name: true } } },
			},
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
