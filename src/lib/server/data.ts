import type { ReportKind, ReportVote } from "$lib/val/BugReportSchema";
import type { CreditRole } from "$lib/val/CreditRoleSchema";
import type { ArtistKind } from "$lib/val/ArtistKindSchema";
import type { ImageKind } from "$lib/val/ImageSchema";
import type { ProjectType } from "$lib/val/ProjectTypeSchema";
import { FOUNDER_SEATS } from "$lib/constants/plans";
import type { StemManifest } from "$lib/audio/types";
import {
	copyBlob,
	deleteBlobs,
	demoPathname,
	midiPathname,
	presentUrl,
	recordingAccess,
	recordingPathname,
	stemPathname,
} from "$lib/server/blob";
import {
	deleteAccountRows,
	deleteArtistRows,
	deleteBugReportRows,
	deleteIdeaRows,
	deleteSongRows,
	deleteUserDocRows,
	deleteUserRows,
} from "$lib/server/cascade";
import { accessOfSongId } from "$lib/server/relocate";
import { db, schema } from "$lib/server/db";
import { barGrid } from "$lib/audio/measures";
import { hashMarkdown } from "$lib/server/markdown";
import { labelFromFilename } from "$lib/utils/labelFromFilename";
import { MAX_DEMOS_PER_SONG } from "$lib/constants/demoFormats";
import { MAX_STEMS_PER_SONG } from "$lib/constants/stemFormats";
import { slugify } from "$lib/utils/slugify";
import { SlugSchema } from "$lib/val/SlugSchema";
import type { PlaybackStatus } from "$lib/val/PlaybackStatusSchema";
import { NOTES_STALE_MS } from "$lib/constants/notesStale";
import type { SongDocKind } from "$lib/val/SongDocKindSchema";
import type { SongChange } from "$lib/val/SongChangeSchema";
import type { SongSection } from "$lib/val/SongSectionSchema";
import type { MemberRole } from "$lib/val/MemberRoleSchema";
import { INVITATION_TTL_MS, type InviteRole } from "$lib/val/InvitationSchema";
import { INVITE_CODE_ALPHABET, INVITE_CODE_LENGTH } from "$lib/val/InviteCodeSchema";
import type { BugStatus } from "$lib/val/BugReportSchema";
import type { AccountStatus } from "$lib/val/AccountStatusSchema";
import type { ShareGrant } from "$lib/server/viewAccess";
import type { Note } from "$lib/audio/chords";
import { and, asc, desc, eq, inArray, isNull, lt, ne, notExists, sql } from "drizzle-orm";
import type { SupportStatus } from "$lib/val/SupportRequestSchema";
import type { ReportPriority } from "$lib/val/BugReportSchema";
import { RELEASES_DOC_SLUG } from "$lib/constants/releasesDoc";
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
	bugReportVote,
	artist,
	artistMember,
	songCredit,
	supportRequest,
	userDoc,
	userDocVersion,
	shareLink,
	aiRequest,
	auditLog,
	recording,
	idea,
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
	const [recordings] = await db
		.select({
			n: sql<number>`count(*)`,
			bytes: sql<number | null>`sum(${recording.sizeBytes})`,
		})
		.from(recording)
		.where(and(eq(recording.accountId, accountId), eq(recording.status, "ready")));
	const row = await db.query.account.findFirst({
		where: eq(account.id, accountId),
		with: { members: { with: { user: { columns: { name: true, email: true } } } } },
	});
	return {
		projects: projects.n,
		songs: songs.n,
		stems: stems.n,
		recordings: recordings.n,
		/** Stems and scratch recordings; demos and renditions are not counted. */
		bytes: (stems.bytes ?? 0) + (recordings.bytes ?? 0),
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
	input: { name: string; slug: string; type: ProjectType },
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
		.set({ name, slug, type: input.type })
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
						columns: {
							id: true,
							status: true,
							url: true,
							playbackStatus: true,
							playbackUrl: true,
							gain: true,
						},
					},
					demos: { columns: { id: true, status: true } },
					credits: {
						columns: { role: true },
						with: { artist: { columns: { id: true, name: true } } },
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
	// The account's default artist performs every new song until someone says otherwise.
	const acct = await db.query.account.findFirst({
		where: eq(account.id, accountId),
		columns: { defaultArtistId: true },
	});
	if (acct?.defaultArtistId) {
		const who = await db.query.artist.findFirst({
			where: and(eq(artist.id, acct.defaultArtistId), eq(artist.accountId, accountId)),
			columns: { id: true },
		});
		if (who) {
			await db
				.insert(songCredit)
				.values({ songId: row.id, artistId: who.id, role: "performer", sortOrder: 1 })
				.onConflictDoNothing();
		}
	}
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
		columns: { id: true, name: true, slug: true, isPrivate: true, noAi: true },
	});
	if (!proj) return null;
	const row = await db.query.song.findFirst({
		where: and(eq(song.projectId, proj.id), eq(song.slug, songSlug)),
		with: {
			stems: { orderBy: [asc(stem.sortOrder), asc(stem.createdAt)] },
			demos: { orderBy: [asc(demo.createdAt)] },
			credits: {
				orderBy: [asc(songCredit.sortOrder), asc(songCredit.createdAt)],
				with: { artist: { columns: { id: true, name: true } } },
			},
		},
	});
	return row ? { ...row, project: proj } : null;
}

// ---- artists and credits (src/lib/remote/songs.remote.ts) ----------------

/** The account's artist directory, by name. */
export function listArtists(accountId: string) {
	return db.query.artist.findMany({
		where: eq(artist.accountId, accountId),
		orderBy: [asc(artist.sortName), asc(artist.name)],
		columns: { id: true, name: true, website: true, kind: true },
	});
}

/**
 * Sets or clears the picture of an account, an artist or a project (scoped to
 * the account); returns the previous URL (to delete its file), null when
 * there was none, or undefined when the row is not the account's.
 */
export async function setImage(
	kind: ImageKind,
	accountId: string,
	id: string,
	imageUrl: string | null,
): Promise<string | null | undefined> {
	if (kind === "account") {
		if (id !== accountId) return undefined;
		const before = await db.query.account.findFirst({
			where: eq(account.id, accountId),
			columns: { imageUrl: true },
		});
		if (!before) return undefined;
		await db.update(account).set({ imageUrl }).where(eq(account.id, accountId));
		return before.imageUrl;
	}
	if (kind === "artist") {
		const before = await db.query.artist.findFirst({
			where: and(eq(artist.accountId, accountId), eq(artist.id, id)),
			columns: { imageUrl: true },
		});
		if (!before) return undefined;
		await db
			.update(artist)
			.set({ imageUrl })
			.where(and(eq(artist.accountId, accountId), eq(artist.id, id)));
		return before.imageUrl;
	}
	const before = await db.query.project.findFirst({
		where: and(eq(project.accountId, accountId), eq(project.id, id)),
		columns: { imageUrl: true },
	});
	if (!before) return undefined;
	await db
		.update(project)
		.set({ imageUrl })
		.where(and(eq(project.accountId, accountId), eq(project.id, id)));
	return before.imageUrl;
}

/** Whether a project is private (its picture then lives in the private store); null when not the account's. */
export async function projectIsPrivate(accountId: string, projectId: string) {
	const row = await db.query.project.findFirst({
		where: and(eq(project.accountId, accountId), eq(project.id, projectId)),
		columns: { isPrivate: true },
	});
	return row ? row.isPrivate : null;
}

/** The directory page: every artist with how many songs credit it and how many people it lists. */
export async function listArtistsWithCounts(accountId: string) {
	const rows = await db.query.artist.findMany({
		where: eq(artist.accountId, accountId),
		orderBy: [asc(artist.sortName), asc(artist.name)],
		with: {
			credits: { columns: { songId: true } },
			members: { columns: { id: true } },
		},
	});
	return rows.map(({ credits, members, ...a }) => ({
		...a,
		songCount: new Set(credits.map((c) => c.songId)).size,
		memberCount: members.length,
	}));
}

/** One artist with its people and the songs that credit it (each with its project, for links). */
export function getArtist(accountId: string, artistId: string) {
	return db.query.artist.findFirst({
		where: and(eq(artist.accountId, accountId), eq(artist.id, artistId)),
		with: {
			members: { orderBy: [asc(artistMember.sortOrder), asc(artistMember.createdAt)] },
			credits: {
				with: {
					song: {
						columns: { id: true, title: true, slug: true, status: true },
						with: { project: { columns: { name: true, slug: true } } },
					},
				},
			},
		},
	});
}

/** The artist's own details; false when another artist of the account has the name. */
export async function updateArtist(
	accountId: string,
	artistId: string,
	input: {
		name: string;
		kind: ArtistKind;
		email: string;
		sortName: string;
		website: string;
		note: string;
	},
) {
	const clash = await db.query.artist.findFirst({
		where: and(eq(artist.accountId, accountId), sql`lower(${artist.name}) = lower(${input.name})`),
		columns: { id: true },
	});
	if (clash && clash.id !== artistId) return false;
	const [row] = await db
		.update(artist)
		.set({ ...input, email: input.email.toLowerCase() })
		.where(and(eq(artist.accountId, accountId), eq(artist.id, artistId)))
		.returning({ id: artist.id });
	return !!row;
}

/** Removes the artist, its people and every credit naming it (explicitly: the database does not enforce the cascades); the default artist is cleared if it was this one. */
export async function deleteArtist(accountId: string, artistId: string) {
	const owner = await db.query.artist.findFirst({
		where: and(eq(artist.accountId, accountId), eq(artist.id, artistId)),
		columns: { id: true, imageUrl: true },
	});
	if (!owner) return false;
	await deleteArtistRows([artistId]);
	if (owner.imageUrl) await deleteBlobs([owner.imageUrl]);
	await db
		.update(account)
		.set({ defaultArtistId: null })
		.where(and(eq(account.id, accountId), eq(account.defaultArtistId, artistId)));
	return true;
}

export async function addArtistMember(
	accountId: string,
	artistId: string,
	input: { name: string; role: string; email: string },
) {
	const owner = await db.query.artist.findFirst({
		where: and(eq(artist.accountId, accountId), eq(artist.id, artistId)),
		columns: { id: true },
	});
	if (!owner) return null;
	const [{ last }] = await db
		.select({ last: sql<number | null>`max(${artistMember.sortOrder})` })
		.from(artistMember)
		.where(eq(artistMember.artistId, artistId));
	const [row] = await db
		.insert(artistMember)
		.values({ artistId, ...input, email: input.email.toLowerCase(), sortOrder: (last ?? 0) + 1 })
		.returning();
	return row;
}

export async function removeArtistMember(accountId: string, memberId: string) {
	const row = await db.query.artistMember.findFirst({
		where: eq(artistMember.id, memberId),
		with: { artist: { columns: { accountId: true } } },
	});
	if (!row || row.artist.accountId !== accountId) return false;
	await db.delete(artistMember).where(eq(artistMember.id, memberId));
	return true;
}

/** An artist with its account, for a solo artist's invitation. */
export function artistById(artistId: string) {
	return db.query.artist.findFirst({
		where: eq(artist.id, artistId),
		columns: { id: true, accountId: true, name: true, kind: true, email: true },
	});
}

/** An artist's member with the artist's account, for an invitation. */
export function artistMemberById(memberId: string) {
	return db.query.artistMember.findFirst({
		where: eq(artistMember.id, memberId),
		with: { artist: { columns: { accountId: true, name: true } } },
	});
}

/** The emails of the account's members, lowercased: the artist page marks people who are already in. */
export async function memberEmails(accountId: string) {
	const rows = await db.query.accountMember.findMany({
		where: eq(accountMember.accountId, accountId),
		with: { user: { columns: { email: true } } },
	});
	return new Set(rows.map((r) => r.user.email.toLowerCase()));
}

/** The artist new songs are credited to, or null. */
export async function accountDefaultArtist(accountId: string) {
	const row = await db.query.account.findFirst({
		where: eq(account.id, accountId),
		columns: { defaultArtistId: true },
	});
	return row?.defaultArtistId ?? null;
}

/** Sets or clears the account's default artist; false when the artist is not the account's. */
export async function setAccountDefaultArtist(accountId: string, artistId: string | null) {
	if (artistId) {
		const who = await db.query.artist.findFirst({
			where: and(eq(artist.id, artistId), eq(artist.accountId, accountId)),
			columns: { id: true },
		});
		if (!who) return false;
	}
	await db.update(account).set({ defaultArtistId: artistId }).where(eq(account.id, accountId));
	return true;
}

/** The account's artist by name (case-insensitive), or a new one. */
async function findOrCreateArtist(accountId: string, name: string) {
	const existing = await db.query.artist.findFirst({
		where: and(eq(artist.accountId, accountId), sql`lower(${artist.name}) = lower(${name})`),
		columns: { id: true, name: true },
	});
	if (existing) return existing;
	const [row] = await db
		.insert(artist)
		.values({ accountId, name })
		.returning({ id: artist.id, name: artist.name });
	return row;
}

/** Credits an artist (found or created by name) on the song in a role; a repeat is a no-op. Null when the song is not the account's. */
export async function addSongCredit(
	accountId: string,
	songId: string,
	role: CreditRole,
	name: string,
) {
	const owner = await db.query.song.findFirst({
		where: and(eq(song.accountId, accountId), eq(song.id, songId)),
		columns: { id: true },
	});
	if (!owner) return null;
	const who = await findOrCreateArtist(accountId, name);
	const [{ last }] = await db
		.select({ last: sql<number | null>`max(${songCredit.sortOrder})` })
		.from(songCredit)
		.where(and(eq(songCredit.songId, songId), eq(songCredit.role, role)));
	await db
		.insert(songCredit)
		.values({ songId, artistId: who.id, role, sortOrder: (last ?? 0) + 1 })
		.onConflictDoNothing();
	return who;
}

/** Removes one credit; the artist stays in the directory. */
export async function removeSongCredit(accountId: string, creditId: string) {
	const row = await db.query.songCredit.findFirst({
		where: eq(songCredit.id, creditId),
		with: { song: { columns: { accountId: true } } },
	});
	if (!row || row.song.accountId !== accountId) return false;
	await db.delete(songCredit).where(eq(songCredit.id, creditId));
	return true;
}

/** The shape the StemPlayer wants: ready stems only. */
export async function manifestFor(s: {
	title: string;
	stems: (typeof stem.$inferSelect)[];
}): Promise<StemManifest> {
	const ready = s.stems.filter((st) => st.status === "ready" && st.url);
	return {
		title: s.title,
		stems: await Promise.all(
			ready.map(async (st) => ({
				id: st.id,
				label: st.label,
				// The player streams the rendition once it exists; the source until then.
				// A private song's file gets a presigned URL the browser may fetch.
				url:
					(await presentUrl(
						st.playbackStatus === "ready" && st.playbackUrl ? st.playbackUrl : st.url,
					)) ?? "",
				duration: st.durationSeconds ?? undefined,
				channels: st.channels ?? undefined,
				peaks: st.peaks ?? undefined,
				gain: st.gain,
			})),
		),
	};
}

/**
 * A song as a page may send it: every file URL replaced by one the browser
 * can fetch (its own for the public store, presigned for the private one).
 */
export async function presentSongFiles<
	S extends {
		mixUrl: string | null;
		stems: { url: string; playbackUrl: string | null; midiUrl: string | null }[];
		demos: { url: string; playbackUrl: string | null }[];
	},
>(s: S): Promise<S> {
	return {
		...s,
		mixUrl: await presentUrl(s.mixUrl),
		stems: await Promise.all(
			s.stems.map(async (st) => ({
				...st,
				url: (await presentUrl(st.url)) ?? st.url,
				playbackUrl: await presentUrl(st.playbackUrl),
				midiUrl: await presentUrl(st.midiUrl),
			})),
		),
		demos: await Promise.all(
			s.demos.map(async (d) => ({
				...d,
				url: (await presentUrl(d.url)) ?? d.url,
				playbackUrl: await presentUrl(d.playbackUrl),
			})),
		),
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
	const owned = await db.query.song.findFirst({
		where: and(eq(song.accountId, accountId), eq(song.id, songId)),
		columns: { id: true },
	});
	if (owned) await deleteSongRows([songId]);
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

/**
 * The song's default mix: one fader per stem, saved by a member for every
 * listener. The cached original mixdown follows it (its key includes the
 * gains), so the project playlist and the MP3 change too.
 */
export async function setDefaultMix(
	accountId: string,
	songId: string,
	gains: { id: string; gain: number }[],
) {
	const owned = await db.query.stem.findMany({
		where: and(eq(stem.accountId, accountId), eq(stem.songId, songId)),
		columns: { id: true },
	});
	const ids = new Set(owned.map((s) => s.id));
	const wanted = gains.filter((g) => ids.has(g.id));
	if (wanted.length === 0) return false;
	for (const g of wanted) {
		await db.update(stem).set({ gain: g.gain }).where(eq(stem.id, g.id));
	}
	await stemsChanged(songId);
	return true;
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
			isSuperAdmin: true,
			twoFactorEnabled: true,
			createdAt: true,
		},
	});
	// The newest session per user is their last sign-in (sessions are created at sign-in).
	const signIns = await db
		.select({ userId: schema.session.userId, last: sql<number>`max(${schema.session.createdAt})` })
		.from(schema.session)
		.groupBy(schema.session.userId);
	const lastSignInOf = new Map(signIns.map((s) => [s.userId, new Date(Number(s.last))]));
	const rolesOf = new Map<
		string,
		{ account: string; slug: string; role: string; isFounder: boolean }[]
	>();
	for (const a of accounts) {
		for (const m of a.members) {
			const list = rolesOf.get(m.userId) ?? [];
			list.push({ account: a.name, slug: a.slug, role: m.role, isFounder: a.isFounder });
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
			plan: a.plan,
			lifetimeFree: a.lifetimeFree,
			isFounder: a.isFounder,
			songs: songsOf.get(a.id) ?? 0,
			bytes: bytesOf.get(a.id) ?? 0,
			members: a.members.map((m) => ({ role: m.role, name: m.user.name, email: m.user.email })),
		})),
		users: users.map((u) => ({
			...u,
			memberships: rolesOf.get(u.id) ?? [],
			lastSignInAt: lastSignInOf.get(u.id) ?? null,
		})),
	};
}

/**
 * Everything the operator wants to know about one user, for
 * /admin/users/[id]: identity and flags, how they sign in (providers, a
 * password, two-factor), their sessions (last sign-in, last seen, how many
 * still open, the newest one's client), their memberships, what they have
 * made across every account (ideas and takes, songs, projects, stems, doc
 * versions, AI requests, bug reports, invitations, share links, invite
 * codes), and their recent audit lines. Null when there is no such user.
 */
export async function userDetail(userId: string) {
	const u = await db.query.user.findFirst({ where: eq(schema.user.id, userId) });
	if (!u) return null;
	const now = Date.now();
	const [
		memberships,
		sessions,
		providers,
		twoFactorRow,
		ideas,
		takes,
		songs,
		projects,
		stems,
		docVersions,
		aiRequests,
		bugReports,
		invitations,
		shareLinks,
		inviteCodes,
		audit,
	] = await Promise.all([
		db.query.accountMember.findMany({
			where: eq(schema.accountMember.userId, userId),
			with: {
				account: { columns: { id: true, name: true, slug: true, status: true, isFounder: true } },
			},
		}),
		db.query.session.findMany({
			where: eq(schema.session.userId, userId),
			orderBy: [desc(schema.session.createdAt)],
			columns: {
				createdAt: true,
				updatedAt: true,
				expiresAt: true,
				ipAddress: true,
				userAgent: true,
			},
		}),
		db.query.authAccount.findMany({
			where: eq(schema.authAccount.userId, userId),
			columns: { providerId: true, password: true, createdAt: true },
		}),
		db.query.twoFactor.findFirst({
			where: eq(schema.twoFactor.userId, userId),
			columns: { userId: true },
		}),
		db
			.select({ n: sql<number>`count(*)` })
			.from(schema.idea)
			.where(eq(schema.idea.createdBy, userId)),
		db
			.select({
				n: sql<number>`count(*)`,
				bytes: sql<number | null>`sum(${schema.recording.sizeBytes})`,
				seconds: sql<number | null>`sum(${schema.recording.durationSeconds})`,
				last: sql<number | null>`max(${schema.recording.createdAt})`,
			})
			.from(schema.recording)
			.where(eq(schema.recording.recordedBy, userId)),
		db
			.select({ n: sql<number>`count(*)` })
			.from(schema.song)
			.where(eq(schema.song.createdBy, userId)),
		db
			.select({ n: sql<number>`count(*)` })
			.from(schema.project)
			.where(eq(schema.project.createdBy, userId)),
		db
			.select({
				n: sql<number>`count(*)`,
				bytes: sql<number | null>`sum(${schema.stem.sizeBytes})`,
				last: sql<number | null>`max(${schema.stem.createdAt})`,
			})
			.from(schema.stem)
			.where(eq(schema.stem.uploadedBy, userId)),
		db
			.select({
				n: sql<number>`count(*)`,
				last: sql<number | null>`max(${schema.songDocVersion.createdAt})`,
			})
			.from(schema.songDocVersion)
			.where(eq(schema.songDocVersion.createdBy, userId)),
		db
			.select({ n: sql<number>`count(*)` })
			.from(schema.aiRequest)
			.where(eq(schema.aiRequest.userId, userId)),
		db
			.select({ n: sql<number>`count(*)` })
			.from(schema.bugReport)
			.where(eq(schema.bugReport.userId, userId)),
		db
			.select({ n: sql<number>`count(*)` })
			.from(schema.invitation)
			.where(eq(schema.invitation.invitedBy, userId)),
		db
			.select({ n: sql<number>`count(*)` })
			.from(schema.shareLink)
			.where(eq(schema.shareLink.createdBy, userId)),
		db
			.select({ n: sql<number>`count(*)` })
			.from(schema.inviteCode)
			.where(eq(schema.inviteCode.createdBy, userId)),
		db.query.auditLog.findMany({
			where: eq(schema.auditLog.userId, userId),
			orderBy: [desc(schema.auditLog.createdAt)],
			limit: 25,
			with: { account: { columns: { name: true, slug: true } } },
		}),
	]);
	const n = (rows: { n: number }[]) => Number(rows[0]?.n ?? 0);
	const at = (v: number | null | undefined) => (v ? new Date(Number(v)) : null);
	const newest = sessions[0] ?? null;
	return {
		id: u.id,
		name: u.name,
		email: u.email,
		emailVerified: u.emailVerified,
		isActive: u.isActive,
		isSystemAdmin: u.isSystemAdmin,
		isSuperAdmin: u.isSuperAdmin,
		createdAt: u.createdAt,
		updatedAt: u.updatedAt,
		signIn: {
			providers: providers.map((p) => p.providerId),
			hasPassword: providers.some((p) => !!p.password),
			twoFactorEnabled: u.twoFactorEnabled,
			twoFactorEnrolled: !!twoFactorRow,
			lastSignInAt: newest?.createdAt ?? null,
			lastSeenAt: sessions.reduce<Date | null>(
				(m, s) => (!m || s.updatedAt > m ? s.updatedAt : m),
				null,
			),
			openSessions: sessions.filter((s) => s.expiresAt.getTime() > now).length,
			totalSessions: sessions.length,
			lastClient: newest ? { ip: newest.ipAddress, userAgent: newest.userAgent } : null,
		},
		memberships: memberships.map((m) => ({
			role: m.role,
			account: m.account.name,
			slug: m.account.slug,
			status: m.account.status,
			isFounder: m.account.isFounder,
			since: m.createdAt,
		})),
		activity: {
			ideas: n(ideas),
			takes: n(takes),
			takeBytes: Number(takes[0]?.bytes ?? 0),
			takeSeconds: Number(takes[0]?.seconds ?? 0),
			lastTakeAt: at(takes[0]?.last),
			songs: n(songs),
			projects: n(projects),
			stems: n(stems),
			stemBytes: Number(stems[0]?.bytes ?? 0),
			lastStemAt: at(stems[0]?.last),
			docVersions: n(docVersions),
			lastDocAt: at(docVersions[0]?.last),
			aiRequests: n(aiRequests),
			bugReports: n(bugReports),
			invitations: n(invitations),
			shareLinks: n(shareLinks),
			inviteCodes: n(inviteCodes),
		},
		audit: audit.map((a) => ({
			id: a.id,
			action: a.action,
			account: a.account ? { name: a.account.name, slug: a.account.slug } : null,
			at: a.createdAt,
		})),
	};
}

// ---- bug reports ------------------------------------------------------------

export async function createBugReport(
	userId: string,
	input: {
		kind: ReportKind;
		title: string;
		body: string;
		pageUrl: string;
		userAgent: string;
		contactEmail: string;
	},
) {
	const [row] = await db
		.insert(bugReport)
		.values({ userId, ...input, contactEmail: input.contactEmail || null })
		.returning();
	return row;
}

/** Newest first, open ones before closed, with who reported each and the vote score. */
export async function listBugReports() {
	const rows = await db.query.bugReport.findMany({
		orderBy: [asc(bugReport.status), desc(bugReport.createdAt)],
		with: {
			reporter: { columns: { name: true, email: true } },
			votes: { columns: { value: true } },
		},
	});
	return rows.map(({ votes, ...r }) => ({ ...r, score: votes.reduce((n, v) => n + v.value, 0) }));
}

/** Records, changes or withdraws (`none`) a user's thumbs on a request; null when the request is unknown. */
export async function voteOnBugReport(reportId: string, userId: string, vote: ReportVote) {
	const exists = await db.query.bugReport.findFirst({
		where: eq(bugReport.id, reportId),
		columns: { id: true },
	});
	if (!exists) return null;
	if (vote === "none") {
		await db
			.delete(bugReportVote)
			.where(and(eq(bugReportVote.reportId, reportId), eq(bugReportVote.userId, userId)));
	} else {
		const value = vote === "up" ? 1 : -1;
		await db
			.insert(bugReportVote)
			.values({ reportId, userId, value })
			.onConflictDoUpdate({
				target: [bugReportVote.reportId, bugReportVote.userId],
				set: { value, updatedAt: new Date() },
			});
	}
	const votes = await db.query.bugReportVote.findMany({
		where: eq(bugReportVote.reportId, reportId),
		columns: { value: true },
	});
	return tally(votes, vote);
}

function tally(votes: { value: number }[], mine: ReportVote) {
	const up = votes.filter((v) => v.value > 0).length;
	const down = votes.length - up;
	return { up, down, score: up - down, mine };
}

// ---- support requests (/support; src/lib/remote/support.remote.ts) ---------

/** A user by email with the active accounts they belong to, for the /support line-up. Null when unknown. */
export async function userAccountsByEmail(email: string) {
	const u = await db.query.user.findFirst({
		where: eq(schema.user.email, email),
		columns: { id: true, name: true, email: true, isActive: true },
		with: {
			memberships: {
				with: { account: { columns: { id: true, name: true, status: true } } },
			},
		},
	});
	if (!u) return null;
	return {
		id: u.id,
		name: u.name,
		email: u.email,
		isActive: u.isActive,
		accounts: u.memberships
			.filter((m) => m.account.status === "active")
			.map((m) => ({ id: m.account.id, name: m.account.name })),
	};
}

export async function createSupportRequest(input: {
	email: string;
	userId: string | null;
	accountId: string | null;
	message: string;
	verifiedBy: "signed-in" | "challenge";
	ipAddress: string;
	userAgent: string;
}) {
	const [row] = await db.insert(supportRequest).values(input).returning();
	return row;
}

export function listSupportRequests() {
	return db.query.supportRequest.findMany({
		orderBy: [asc(supportRequest.status), desc(supportRequest.createdAt)],
		with: {
			sender: { columns: { name: true } },
			account: { columns: { name: true, slug: true } },
		},
	});
}

export async function setSupportRequestStatus(id: string, status: SupportStatus) {
	const [row] = await db
		.update(supportRequest)
		.set({ status, closedAt: status === "closed" ? new Date() : null })
		.where(eq(supportRequest.id, id))
		.returning({ id: supportRequest.id });
	return !!row;
}

export async function deleteSupportRequest(id: string) {
	const [row] = await db
		.delete(supportRequest)
		.where(eq(supportRequest.id, id))
		.returning({ id: supportRequest.id });
	return !!row;
}

/** Sets the status; returns the row's kind, title and contact email (for the "it shipped" email) or null when unknown. */
export async function setBugReportStatus(id: string, status: BugStatus) {
	const [row] = await db
		.update(bugReport)
		.set({ status, closedAt: status === "open" ? null : new Date() })
		.where(eq(bugReport.id, id))
		.returning({
			id: bugReport.id,
			kind: bugReport.kind,
			title: bugReport.title,
			contactEmail: bugReport.contactEmail,
		});
	return row ?? null;
}

export async function setBugReportPriority(id: string, priority: ReportPriority | null) {
	const [row] = await db
		.update(bugReport)
		.set({ priority })
		.where(eq(bugReport.id, id))
		.returning({ id: bugReport.id });
	return !!row;
}

/** Saves the admin's response; returns the requester's address and the request's title for the email, or null. */
export async function respondToBugReport(id: string, response: string) {
	const [row] = await db
		.update(bugReport)
		.set({ response, respondedAt: response ? new Date() : null })
		.where(eq(bugReport.id, id))
		.returning({
			id: bugReport.id,
			title: bugReport.title,
			kind: bugReport.kind,
			userId: bugReport.userId,
			contactEmail: bugReport.contactEmail,
		});
	if (!row) return null;
	const reporter = row.userId
		? await db.query.user.findFirst({
				where: eq(schema.user.id, row.userId),
				columns: { email: true, name: true },
			})
		: null;
	return { title: row.title, kind: row.kind, contactEmail: row.contactEmail, reporter };
}

export async function deleteBugReport(id: string) {
	const row = await db.query.bugReport.findFirst({
		where: eq(bugReport.id, id),
		columns: { id: true },
	});
	if (!row) return false;
	await deleteBugReportRows([id]);
	return true;
}

/**
 * Feature requests as signed-in users see them: no reporter, each with its
 * vote tally and the viewer's own thumbs; open ones by score (then newest),
 * then complete, then closed.
 */
export async function listFeatureRequestsPublic(userId: string | null) {
	const rows = await db.query.bugReport.findMany({
		where: eq(bugReport.kind, "feature"),
		orderBy: [asc(bugReport.status), desc(bugReport.createdAt)],
		columns: {
			id: true,
			title: true,
			body: true,
			status: true,
			priority: true,
			response: true,
			respondedAt: true,
			createdAt: true,
		},
		with: { votes: { columns: { value: true, userId: true } } },
	});
	return rows
		.map(({ votes, ...r }) => {
			const own = votes.find((v) => v.userId === userId);
			const mine: ReportVote = own ? (own.value > 0 ? "up" : "down") : "none";
			return { ...r, votes: tally(votes, mine) };
		})
		.sort((a, b) =>
			a.status !== b.status
				? 0
				: b.votes.score - a.votes.score || b.createdAt.getTime() - a.createdAt.getTime(),
		);
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
/** The documentation pages, without the release notes (they have their own page, /releases). */
export function listUserDocs() {
	return db.query.userDoc.findMany({
		where: ne(userDoc.slug, RELEASES_DOC_SLUG),
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
	const row = await db.query.userDoc.findFirst({
		where: eq(userDoc.id, id),
		columns: { id: true },
	});
	if (!row) return false;
	await deleteUserDocRows([id]);
	return true;
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
	const exists = await db.query.user.findFirst({
		where: eq(schema.user.id, id),
		columns: { id: true },
	});
	if (!exists) return null;
	await deleteUserRows(id);
	let accountsRemoved = 0;
	for (const { accountId } of memberships) {
		const left = await db.query.accountMember.findFirst({
			where: eq(accountMember.accountId, accountId),
		});
		if (left) continue;
		const content = await db.query.project.findFirst({ where: eq(project.accountId, accountId) });
		if (content) continue;
		await deleteAccountRows(accountId);
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
	const pictures = [
		...(await db
			.select({ imageUrl: project.imageUrl })
			.from(project)
			.where(eq(project.accountId, id))),
		...(await db
			.select({ imageUrl: artist.imageUrl })
			.from(artist)
			.where(eq(artist.accountId, id))),
		...(await db.select({ imageUrl: account.imageUrl }).from(account).where(eq(account.id, id))),
	].map((r) => r.imageUrl ?? "");
	const recordings = await db
		.select({ url: recording.url, playbackUrl: recording.playbackUrl })
		.from(recording)
		.where(eq(recording.accountId, id));
	await deleteBlobs([
		...stems.flatMap((r) => [r.url, r.playbackUrl ?? "", r.midiUrl ?? ""]),
		...demos.flatMap((d) => [d.url, d.playbackUrl ?? ""]),
		...recordings.flatMap((r) => [r.url, r.playbackUrl ?? ""]),
		...mixes.map((m) => m.mixUrl ?? ""),
		...pictures,
	]);
	const exists = await db.query.account.findFirst({
		where: eq(account.id, id),
		columns: { id: true },
	});
	if (!exists) return false;
	await deleteAccountRows(id);
	return true;
}

/** A new account with the user as its owner; the slug comes from the name and is made unique. */
export async function createOwnedAccount(userId: string, name: string) {
	const base = slugify(name) || "account";
	const taken = new Set((await db.select({ slug: account.slug }).from(account)).map((r) => r.slug));
	let slug = base;
	for (let n = 2; taken.has(slug); n++) slug = `${base.slice(0, 60)}-${n}`;
	// The first FOUNDER_SEATS accounts ever created are founders (docs/billing.md).
	const isFounder = taken.size < FOUNDER_SEATS;
	const [row] = await db.insert(account).values({ name, slug, isFounder }).returning();
	await db.insert(accountMember).values({ accountId: row.id, userId, role: "owner" });
	return row;
}

/** Founder status for every account the user owns (the users page on /admin); returns how many changed. */
export async function setUserFounder(userId: string, isFounder: boolean) {
	const owned = await db
		.select({ accountId: accountMember.accountId })
		.from(accountMember)
		.where(and(eq(accountMember.userId, userId), eq(accountMember.role, "owner")));
	if (owned.length === 0) return 0;
	await db
		.update(account)
		.set({ isFounder })
		.where(
			inArray(
				account.id,
				owned.map((o) => o.accountId),
			),
		);
	return owned.length;
}

/** Founder status, granted or revoked by a super admin from /admin. */
export async function setAccountFounder(id: string, isFounder: boolean) {
	const [row] = await db
		.update(account)
		.set({ isFounder })
		.where(eq(account.id, id))
		.returning({ id: account.id });
	return !!row;
}

// ---- memberships ------------------------------------------------------------

/** Every account the user belongs to, with their role and the account's size, for /accounts. */
export async function accountsOf(userId: string) {
	const rows = await db.query.accountMember.findMany({
		where: eq(accountMember.userId, userId),
		with: {
			account: {
				columns: {
					id: true,
					name: true,
					slug: true,
					status: true,
					createdAt: true,
					plan: true,
					lifetimeFree: true,
					isFounder: true,
				},
			},
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
			plan: m.account.plan,
			lifetimeFree: m.account.lifetimeFree,
			isFounder: m.account.isFounder,
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

/** The pathname a stem, its MIDI file or a demo was reserved at, so the URL the browser reports can be checked. */
export async function reservedPathname(
	accountId: string,
	kind: "stem" | "midi" | "demo" | "recording",
	id: string,
): Promise<string | null> {
	if (kind === "recording") {
		const r = await db.query.recording.findFirst({
			where: and(eq(recording.accountId, accountId), eq(recording.id, id)),
			columns: { pathname: true },
		});
		return r?.pathname ?? null;
	}
	if (kind === "demo") {
		const d = await db.query.demo.findFirst({
			where: and(eq(demo.accountId, accountId), eq(demo.id, id)),
			columns: { pathname: true },
		});
		return d?.pathname ?? null;
	}
	const st = await db.query.stem.findFirst({
		where: and(eq(stem.accountId, accountId), eq(stem.id, id)),
		columns: { pathname: true, midiPathname: true },
	});
	if (!st) return null;
	return kind === "midi" ? st.midiPathname : st.pathname;
}

// ---- audit log --------------------------------------------------------------

export async function logAudit(entry: { userId: string; accountId: string; action: string }) {
	await db.insert(auditLog).values(entry);
}

/** The latest acting-owner uses, newest first, for /admin. */
export function listAuditLog(limit = 50) {
	return db.query.auditLog.findMany({
		orderBy: [desc(auditLog.createdAt)],
		limit,
		with: { user: { columns: { name: true } }, account: { columns: { name: true, slug: true } } },
	});
}

/** A song by id within its account: title, changes, sections, start marker and chart. */
export function getSongById(accountId: string, songId: string) {
	return db.query.song.findFirst({
		where: and(eq(song.accountId, accountId), eq(song.id, songId)),
		columns: {
			id: true,
			title: true,
			changes: true,
			sections: true,
			startAt: true,
			chartMarkdown: true,
			noAi: true,
		},
		with: { project: { columns: { noAi: true } } },
	});
}

/** Up to two other songs of the account with a chart and sections, as style examples for an AI draft. */
export async function chartExamples(accountId: string, excludeSongId: string) {
	const rows = await db.query.song.findMany({
		where: and(eq(song.accountId, accountId), eq(song.status, "active")),
		columns: { id: true, title: true, chartMarkdown: true, sections: true, changes: true },
	});
	return rows
		.filter(
			(r) => r.id !== excludeSongId && r.chartMarkdown.trim().length > 80 && r.sections.length > 0,
		)
		.slice(0, 2)
		.map((r) => ({
			title: r.title,
			sections: r.sections,
			changes: r.changes,
			chart: r.chartMarkdown.slice(0, 3000),
		}));
}

// ---- no AI, and transcribed notes ------------------------------------------

export async function setProjectNoAi(accountId: string, id: string, noAi: boolean) {
	const [row] = await db
		.update(project)
		.set({ noAi })
		.where(and(eq(project.accountId, accountId), eq(project.id, id)))
		.returning({ id: project.id });
	return !!row;
}

export async function setSongNoAi(accountId: string, id: string, noAi: boolean) {
	const [row] = await db
		.update(song)
		.set({ noAi })
		.where(and(eq(song.accountId, accountId), eq(song.id, id)))
		.returning({ id: song.id });
	return !!row;
}

export async function setSongFinished(accountId: string, id: string, isFinished: boolean) {
	const [row] = await db
		.update(song)
		.set({ isFinished })
		.where(and(eq(song.accountId, accountId), eq(song.id, id)))
		.returning({ id: song.id });
	return !!row;
}

/** What the transcription job needs: flags, stems with their files, progress so far. */
export function songForNotes(songId: string) {
	return db.query.song.findFirst({
		where: eq(song.id, songId),
		columns: { id: true, noAi: true, notesKey: true, notesDoneSeconds: true, notesStartedAt: true },
		with: {
			project: { columns: { noAi: true } },
			stems: {
				columns: {
					id: true,
					status: true,
					url: true,
					playbackStatus: true,
					playbackUrl: true,
					gain: true,
					durationSeconds: true,
				},
			},
		},
	});
}

/**
 * Marks the job started (a stale claim is taken over) and records which stems
 * it is transcribing, so a later run with the same stems carries on where
 * this one stopped; `fresh` (the stems changed) wipes what was there.
 */
export async function claimSongNotes(songId: string, key: string, fresh: boolean) {
	const now = Date.now();
	const rows = await db
		.update(song)
		.set({
			notesStartedAt: new Date(now),
			notesKey: key,
			...(fresh ? { notesJson: [], notesDoneSeconds: 0 } : {}),
		})
		.where(
			and(
				eq(song.id, songId),
				sql`(${song.notesStartedAt} is null or ${song.notesStartedAt} < ${now - NOTES_STALE_MS})`,
			),
		)
		.returning({ id: song.id });
	return rows.length > 0;
}

/** Appends a segment's notes; a compare-and-set on the progress so two writers can never interleave. */
export async function appendSongNotes(songId: string, notes: Note[], doneSeconds: number) {
	for (let attempt = 0; attempt < 3; attempt++) {
		const row = await db.query.song.findFirst({
			where: eq(song.id, songId),
			columns: { notesJson: true, notesDoneSeconds: true },
		});
		if (!row) return;
		const rows = await db
			.update(song)
			.set({ notesJson: [...(row.notesJson ?? []), ...notes], notesDoneSeconds: doneSeconds })
			.where(and(eq(song.id, songId), eq(song.notesDoneSeconds, row.notesDoneSeconds)))
			.returning({ id: song.id });
		if (rows.length > 0) return;
	}
	throw new Error("could not append notes: another writer kept changing the song");
}

export async function finishSongNotes(songId: string) {
	await db.update(song).set({ notesStartedAt: null }).where(eq(song.id, songId));
}

export async function releaseSongNotes(songId: string) {
	await db.update(song).set({ notesStartedAt: null }).where(eq(song.id, songId));
}

/** The stored notes for a member's page, with whether they are complete for the current stems. */
export async function songNotesFor(accountId: string, songId: string) {
	const row = await db.query.song.findFirst({
		where: and(eq(song.accountId, accountId), eq(song.id, songId)),
		columns: { notesJson: true, notesKey: true, notesDoneSeconds: true },
		with: {
			stems: {
				columns: {
					id: true,
					status: true,
					url: true,
					playbackStatus: true,
					playbackUrl: true,
					gain: true,
					durationSeconds: true,
				},
			},
		},
	});
	if (!row) return null;
	const stems = row.stems.filter((s) => s.status === "ready" && s.url);
	const duration = Math.max(0, ...stems.map((s) => s.durationSeconds ?? 0));
	return {
		notes: row.notesJson ?? [],
		doneSeconds: row.notesDoneSeconds,
		duration,
		complete: row.notesKey !== null && row.notesDoneSeconds >= duration && duration > 0,
	};
}

// ---- AI requests ------------------------------------------------------------

export type AiRequestLog = Omit<typeof aiRequest.$inferInsert, "id" | "createdAt" | "updatedAt">;

export async function logAiRequest(entry: AiRequestLog) {
	await db.insert(aiRequest).values(entry);
}

/** The latest calls, newest first, with who and which song, for /admin. */
export function listAiRequests(limit = 50) {
	return db.query.aiRequest.findMany({
		orderBy: [desc(aiRequest.createdAt)],
		limit,
		with: {
			user: { columns: { name: true } },
			song: {
				columns: { title: true, slug: true },
				with: {
					project: { columns: { slug: true }, with: { account: { columns: { slug: true } } } },
				},
			},
		},
	});
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

// ---- scratch recordings (docs/demo-recording.md) ---------------------------

/** Step 1 of a recording upload: the row, its pathname and the store it goes to. */
/** A new idea: a title and an empty note board; takes come later. */
export async function createIdea(accountId: string, userId: string, title: string) {
	const [row] = await db
		.insert(idea)
		.values({ accountId, createdBy: userId, title: title.trim() || "Untitled" })
		.returning();
	return row;
}

/**
 * Ideas are the user's own within the account: other members do not see
 * them until a take is added to a song (a share feature may come later).
 */
export async function userOwnsIdea(accountId: string, userId: string, ideaId: string) {
	const row = await db.query.idea.findFirst({
		where: and(eq(idea.accountId, accountId), eq(idea.id, ideaId), eq(idea.createdBy, userId)),
		columns: { id: true },
	});
	return !!row;
}

/** A take is the user's when its idea is. */
export async function userOwnsRecording(accountId: string, userId: string, recordingId: string) {
	const row = await db.query.recording.findFirst({
		where: and(eq(recording.accountId, accountId), eq(recording.id, recordingId)),
		columns: { ideaId: true },
	});
	return !!row?.ideaId && (await userOwnsIdea(accountId, userId, row.ideaId));
}

/** The user's ideas in the account, newest first, each with its ready takes in order and URLs the browser may fetch. */
export async function listIdeas(accountId: string, userId: string) {
	const rows = await db.query.idea.findMany({
		where: and(eq(idea.accountId, accountId), eq(idea.createdBy, userId)),
		orderBy: [desc(idea.createdAt)],
		with: {
			takes: {
				where: eq(recording.status, "ready"),
				orderBy: [asc(recording.takeNumber), asc(recording.createdAt)],
			},
		},
	});
	return Promise.all(
		rows.map(async (i) => ({
			...i,
			takes: await Promise.all(
				i.takes.map(async (t) => ({
					...t,
					url: (await presentUrl(t.url)) ?? t.url,
					playbackUrl: await presentUrl(t.playbackUrl),
					codec: t.codec,
				})),
			),
		})),
	);
}

export async function renameIdea(accountId: string, ideaId: string, title: string) {
	const [row] = await db
		.update(idea)
		.set({ title })
		.where(and(eq(idea.accountId, accountId), eq(idea.id, ideaId)))
		.returning({ id: idea.id });
	return !!row;
}

export async function setIdeaNotes(accountId: string, ideaId: string, notes: string) {
	const [row] = await db
		.update(idea)
		.set({ notes })
		.where(and(eq(idea.accountId, accountId), eq(idea.id, ideaId)))
		.returning({ id: idea.id });
	return !!row;
}

/**
 * Removes the idea when it has neither takes nor notes (nothing worth
 * keeping): after its last take goes, after its notes are cleared, after a
 * failed upload is discarded. True when it went.
 */
export async function deleteIdeaIfEmpty(accountId: string, ideaId: string) {
	const row = await db.query.idea.findFirst({
		where: and(eq(idea.accountId, accountId), eq(idea.id, ideaId)),
		columns: { notes: true },
		with: { takes: { columns: { id: true }, limit: 1 } },
	});
	if (!row || row.notes.trim() || row.takes.length > 0) return false;
	return deleteIdea(accountId, ideaId);
}

/**
 * Sweeps the user's ideas that never got a take or notes and are older than
 * `olderThanMs` (a fresh one may still have its first take uploading).
 * Runs when the recorder page loads.
 */
export async function deleteEmptyIdeas(accountId: string, userId: string, olderThanMs: number) {
	const cutoff = new Date(Date.now() - olderThanMs);
	const rows = await db
		.select({ id: idea.id })
		.from(idea)
		.where(
			and(
				eq(idea.accountId, accountId),
				eq(idea.createdBy, userId),
				lt(idea.createdAt, cutoff),
				sql`trim(${idea.notes}) = ''`,
				notExists(
					db.select({ id: recording.id }).from(recording).where(eq(recording.ideaId, idea.id)),
				),
			),
		);
	for (const r of rows) await deleteIdea(accountId, r.id);
	return rows.length;
}

/** Removes the idea and every take, files included. */
export async function deleteIdea(accountId: string, ideaId: string) {
	const takes = await db
		.select({ url: recording.url, playbackUrl: recording.playbackUrl })
		.from(recording)
		.where(and(eq(recording.accountId, accountId), eq(recording.ideaId, ideaId)));
	const row = await db.query.idea.findFirst({
		where: and(eq(idea.accountId, accountId), eq(idea.id, ideaId)),
		columns: { id: true },
	});
	if (!row) return false;
	await deleteIdeaRows([ideaId]);
	await deleteBlobs(takes.flatMap((t) => [t.url, t.playbackUrl ?? ""]));
	return true;
}

/** Step 1 of saving a take: the row (numbered after the idea's last take), its pathname and the store it goes to. */
export async function createRecording(
	accountId: string,
	userId: string,
	ideaId: string,
	file: NewStemFile & { title: string; codec: string | null; trimSilence: boolean },
) {
	const owner = await db.query.idea.findFirst({
		where: and(eq(idea.accountId, accountId), eq(idea.id, ideaId)),
		columns: { id: true },
	});
	if (!owner) return null;
	const [{ last }] = await db
		.select({ last: sql<number | null>`max(${recording.takeNumber})` })
		.from(recording)
		.where(eq(recording.ideaId, ideaId));
	const id = nanoid();
	const [row] = await db
		.insert(recording)
		.values({
			id,
			accountId,
			recordedBy: userId,
			ideaId,
			takeNumber: (last ?? 0) + 1,
			title: file.title,
			url: "",
			pathname: recordingPathname(accountId, id, file.filename),
			filename: file.filename,
			contentType: file.contentType,
			sizeBytes: file.sizeBytes,
			codec: file.codec,
			trimSilence: file.trimSilence,
		})
		.returning();
	return row;
}

export function findUploadingRecording(accountId: string, pathname: string) {
	return db.query.recording.findFirst({
		where: and(
			eq(recording.accountId, accountId),
			eq(recording.pathname, pathname),
			eq(recording.status, "uploading"),
		),
	});
}

/** Step 3: the browser reports the blob URL and the length it timed. */
export async function markRecordingReady(
	accountId: string,
	recordingId: string,
	url: string,
	durationSeconds: number | null,
) {
	const [row] = await db
		.update(recording)
		.set({ status: "ready", url, durationSeconds })
		.where(and(eq(recording.accountId, accountId), eq(recording.id, recordingId)))
		.returning({ id: recording.id });
	return row ?? null;
}

/** Production backstop from Vercel's completion webhook. */
export async function recordRecordingUrl(pathname: string, url: string) {
	await db
		.update(recording)
		.set({ url, status: "ready" })
		.where(and(eq(recording.pathname, pathname), eq(recording.status, "uploading")));
}

export async function renameRecording(accountId: string, recordingId: string, title: string) {
	const [row] = await db
		.update(recording)
		.set({ title })
		.where(and(eq(recording.accountId, accountId), eq(recording.id, recordingId)))
		.returning({ id: recording.id });
	return !!row;
}

export async function deleteRecording(accountId: string, recordingId: string) {
	const [row] = await db
		.delete(recording)
		.where(and(eq(recording.accountId, accountId), eq(recording.id, recordingId)))
		.returning({
			url: recording.url,
			playbackUrl: recording.playbackUrl,
			ideaId: recording.ideaId,
		});
	if (!row) return null;
	await deleteBlobs([row.url, row.playbackUrl ?? ""]);
	return { ideaId: row.ideaId };
}

/**
 * Adds a recording to a song as a demo: the file (and its MP3, when
 * rendered) are copied under the song, in the song's store, so the
 * recording stays in the library and the demo lives and dies with the song.
 */
export async function copyRecordingToSong(
	accountId: string,
	userId: string,
	recordingId: string,
	songId: string,
) {
	const rec = await db.query.recording.findFirst({
		where: and(
			eq(recording.accountId, accountId),
			eq(recording.id, recordingId),
			eq(recording.status, "ready"),
		),
	});
	if (!rec) return null;
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
	const access = (await accessOfSongId(songId)) ?? "public";
	const id = nanoid();
	const pathname = demoPathname(accountId, songId, id, rec.filename);
	const url = await copyBlob(rec.url, pathname, access);
	let playback: { url: string; pathname: string; bytes: number } | null = null;
	if (rec.playbackStatus === "ready" && rec.playbackUrl && rec.playbackPathname) {
		const playbackPath =
			pathname.replace(/\.[a-z0-9]+$/i, "") + `.play-${Date.now().toString(36)}.mp3`;
		playback = {
			url: await copyBlob(rec.playbackUrl, playbackPath, access),
			pathname: playbackPath,
			bytes: rec.playbackBytes ?? 0,
		};
	}
	const [row] = await db
		.insert(demo)
		.values({
			id,
			accountId,
			songId,
			label: rec.title,
			status: "ready",
			url,
			pathname,
			filename: rec.filename,
			contentType: rec.contentType,
			sizeBytes: rec.sizeBytes,
			uploadedBy: userId,
			...(playback
				? {
						playbackStatus: "ready" as const,
						playbackUrl: playback.url,
						playbackPathname: playback.pathname,
						playbackBytes: playback.bytes,
						playbackStartedAt: new Date(),
					}
				: {}),
		})
		.returning({ id: demo.id });
	return row;
}

/**
 * The idea's notes join the song's notes document (a new version, like any
 * edit): appended under a heading naming the idea and take, or the whole
 * document when the song had none. Empty idea notes change nothing.
 */
export async function mergeIdeaNotesIntoSong(
	accountId: string,
	userId: string,
	songId: string,
	recordingId: string,
) {
	const take = await db.query.recording.findFirst({
		where: and(eq(recording.accountId, accountId), eq(recording.id, recordingId)),
		with: { idea: { columns: { title: true, notes: true } } },
	});
	const notes = take?.idea?.notes.trim() ?? "";
	if (!take?.idea || !notes) return false;
	const s = await db.query.song.findFirst({
		where: and(eq(song.accountId, accountId), eq(song.id, songId)),
		columns: { notesMarkdown: true },
	});
	if (!s) return false;
	const label = `${take.idea.title} · Take ${take.takeNumber}${take.title ? ` · ${take.title}` : ""}`;
	const merged = s.notesMarkdown.trim()
		? `${s.notesMarkdown.replace(/\s+$/, "")}\n\n## ${label}\n\n${notes}\n`
		: `${notes}\n`;
	const result = await saveSongDoc(accountId, userId, songId, "notes", merged);
	return result.ok;
}

/** Which recordings still want an MP3 (same rules as stems' renditions). */
export function recordingsWantingPlayback(
	rows: {
		id: string;
		status: string;
		url: string;
		playbackStatus: PlaybackStatus | null;
		playbackStartedAt: Date | null;
	}[],
	now = Date.now(),
) {
	return stemsWantingPlayback(rows, now);
}

export async function claimRecordingPlayback(recordingId: string) {
	const now = new Date();
	const [row] = await db
		.update(recording)
		.set({ playbackStatus: "pending", playbackStartedAt: now })
		.where(
			and(
				eq(recording.id, recordingId),
				eq(recording.status, "ready"),
				sql`(${recording.playbackStatus} is null
					or (${recording.playbackStatus} = 'failed' and ${recording.playbackStartedAt} < ${now.getTime() - PLAYBACK_RETRY_MS})
					or (${recording.playbackStatus} = 'pending' and ${recording.playbackStartedAt} < ${now.getTime() - PLAYBACK_STALE_MS}))`,
			),
		)
		.returning({
			id: recording.id,
			url: recording.url,
			pathname: recording.pathname,
			playbackUrl: recording.playbackUrl,
			contentType: recording.contentType,
			codec: recording.codec,
			trimSilence: recording.trimSilence,
		});
	return row ?? null;
}

export async function finishRecordingPlayback(
	recordingId: string,
	r: { url: string; pathname: string; bytes: number },
) {
	await db
		.update(recording)
		.set({
			playbackStatus: "ready",
			playbackUrl: r.url,
			playbackPathname: r.pathname,
			playbackBytes: r.bytes,
		})
		.where(eq(recording.id, recordingId));
}

/**
 * The take's source file was replaced by the jobs function (raw PCM from
 * Chrome turned into FLAC, or silence trimmed off the ends): the row
 * follows, with the new length when it changed, and the trim request is
 * cleared so a retry does not cut again. The copy a song may already hold
 * keeps the old file.
 */
export async function replaceRecordingSource(
	recordingId: string,
	r: {
		url: string;
		pathname: string;
		filename: string;
		contentType: string;
		sizeBytes: number;
		codec: string | null;
		durationSeconds?: number;
	},
) {
	await db
		.update(recording)
		.set({
			url: r.url,
			pathname: r.pathname,
			filename: r.filename,
			contentType: r.contentType,
			sizeBytes: r.sizeBytes,
			codec: r.codec,
			...(r.durationSeconds !== undefined ? { durationSeconds: r.durationSeconds } : {}),
			trimSilence: false,
		})
		.where(eq(recording.id, recordingId));
}

export async function failRecordingPlayback(recordingId: string) {
	await db.update(recording).set({ playbackStatus: "failed" }).where(eq(recording.id, recordingId));
}

/** The store a recording's own upload goes to (the upload handler's token). */
export const recordingStore = recordingAccess;

/** Active projects with their active songs, for the "add this recording to a song" picker. */
export async function songPicker(accountId: string) {
	const rows = await db.query.project.findMany({
		where: and(eq(project.accountId, accountId), eq(project.status, "active")),
		orderBy: [asc(project.sortOrder), asc(project.name)],
		columns: { id: true, name: true },
		with: {
			songs: {
				where: eq(song.status, "active"),
				orderBy: [asc(song.title)],
				columns: { id: true, title: true },
			},
		},
	});
	return rows;
}

/** A song's title and page, for the recorder opened from that song. */
export async function songLink(accountId: string, songId: string) {
	const row = await db.query.song.findFirst({
		where: and(eq(song.accountId, accountId), eq(song.id, songId)),
		columns: { id: true, title: true, slug: true },
		with: { project: { columns: { slug: true } }, account: { columns: { slug: true } } },
	});
	return row
		? {
				id: row.id,
				title: row.title,
				href: `/${row.account.slug}/projects/${row.project.slug}/${row.slug}`,
			}
		: null;
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
			noAi: true,
			title: true,
			slug: true,
			mixUrl: true,
			mixKey: true,
			mixStartedAt: true,
			changes: true,
		},
		with: {
			project: {
				columns: { slug: true, name: true, isPrivate: true, noAi: true },
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
					gain: true,
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
			gain: number;
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

// ---- app settings and the home page demo ----------------------------------

/** The song the home page demos, when none is chosen: Kevin's "Eat All the Clocks". */
export const DEFAULT_FEATURED_SONG = {
	account: "mmkk",
	project: "badverbs",
	song: "eat-all-the-clocks",
} as const;

export async function getAppSetting(key: string) {
	const row = await db.query.appSetting.findFirst({ where: eq(schema.appSetting.key, key) });
	return row?.value ?? null;
}

export async function setAppSetting(key: string, value: string) {
	await db
		.insert(schema.appSetting)
		.values({ key, value })
		.onConflictDoUpdate({ target: schema.appSetting.key, set: { value } });
}

/** A song by its address, the shape the song page loads. */
async function songByPath(accountSlug: string, projectSlug: string, songSlug: string) {
	const acct = await db.query.account.findFirst({
		where: eq(account.slug, accountSlug),
		columns: { id: true, slug: true, status: true },
	});
	if (!acct || acct.status !== "active") return null;
	const row = await getSong(acct.id, projectSlug, songSlug);
	return row ? { ...row, accountSlug: acct.slug } : null;
}

/**
 * The home page's featured song: the chosen one if it is still public and
 * live, else the default. Public means the song and its project are not
 * private and the account is active; nothing else ever reaches the page.
 */
export async function featuredSong() {
	const chosen = await getAppSetting("featuredSongId");
	if (chosen) {
		const found = await db.query.song.findFirst({
			where: and(eq(song.id, chosen), eq(song.status, "active")),
			columns: { slug: true },
			with: {
				project: { columns: { slug: true }, with: { account: { columns: { slug: true } } } },
			},
		});
		if (found) {
			const row = await songByPath(found.project.account.slug, found.project.slug, found.slug);
			if (row && isPublicSong(row)) return row;
		}
	}
	const fallback = await songByPath(
		DEFAULT_FEATURED_SONG.account,
		DEFAULT_FEATURED_SONG.project,
		DEFAULT_FEATURED_SONG.song,
	);
	return fallback && isPublicSong(fallback) ? fallback : null;
}

function isPublicSong(s: { isPrivate: boolean; status: string; project: { isPrivate: boolean } }) {
	return !s.isPrivate && !s.project.isPrivate && s.status === "active";
}

/** Every public, playable song on the platform, for the admin's featured-song picker. */
export async function listPublicSongs() {
	const rows = await db.query.song.findMany({
		where: and(eq(song.isPrivate, false), eq(song.status, "active")),
		columns: { id: true, title: true, slug: true, version: true },
		with: {
			project: {
				columns: { name: true, slug: true, isPrivate: true, status: true },
				with: { account: { columns: { name: true, slug: true, status: true } } },
			},
			stems: { columns: { status: true } },
		},
	});
	return rows
		.filter(
			(r) =>
				!r.project.isPrivate &&
				r.project.status === "active" &&
				r.project.account.status === "active" &&
				r.stems.some((st) => st.status === "ready"),
		)
		.map((r) => ({
			id: r.id,
			title: r.title,
			version: r.version,
			project: r.project.name,
			account: r.project.account.name,
			path: `/${r.project.account.slug}/projects/${r.project.slug}/${r.slug}`,
			stems: r.stems.filter((st) => st.status === "ready").length,
		}))
		.sort((a, b) => a.account.localeCompare(b.account) || a.title.localeCompare(b.title));
}

// ---- the beta waitlist ---------------------------------------------------------

const { waitlistSignup } = schema;

/**
 * Joins the waitlist, or refreshes an existing entry. Returns what to do
 * next: "confirm" (a confirmation email is due, for a new or still-pending
 * address), "already" (confirmed or invited; nothing to send), or "removed"
 * (they left; the entry is revived as pending and a confirmation is due).
 */
export async function joinWaitlist(input: {
	email: string;
	name: string;
	updatesOk: boolean;
	source: string;
}) {
	const existing = await db.query.waitlistSignup.findFirst({
		where: eq(waitlistSignup.email, input.email),
	});
	if (existing) {
		if (existing.status === "confirmed" || existing.status === "invited") {
			return { next: "already" as const, row: existing };
		}
		const [row] = await db
			.update(waitlistSignup)
			.set({
				name: input.name || existing.name,
				updatesOk: input.updatesOk || existing.updatesOk,
				status: "pending",
				confirmToken: nanoid(32),
			})
			.where(eq(waitlistSignup.id, existing.id))
			.returning();
		return { next: "confirm" as const, row };
	}
	const [row] = await db
		.insert(waitlistSignup)
		.values({
			email: input.email,
			name: input.name,
			updatesOk: input.updatesOk,
			confirmToken: nanoid(32),
			manageToken: nanoid(32),
			source: input.source,
		})
		.returning();
	return { next: "confirm" as const, row };
}

/** The confirmation link: pending → confirmed. Returns the entry, or null for a token that is not open. */
export async function confirmWaitlist(token: string) {
	const [row] = await db
		.update(waitlistSignup)
		.set({ status: "confirmed", confirmedAt: new Date() })
		.where(and(eq(waitlistSignup.confirmToken, token), eq(waitlistSignup.status, "pending")))
		.returning();
	return row ?? null;
}

export function waitlistByManageToken(token: string) {
	return db.query.waitlistSignup.findFirst({ where: eq(waitlistSignup.manageToken, token) });
}

/** The manage link: consent on or off, or leave the list (the row stays as "removed" so a re-join needs a new confirmation). */
export async function setWaitlistPrefs(
	token: string,
	action: "updates-on" | "updates-off" | "leave",
) {
	const [row] = await db
		.update(waitlistSignup)
		.set(
			action === "leave"
				? { status: "removed", updatesOk: false }
				: { updatesOk: action === "updates-on" },
		)
		.where(eq(waitlistSignup.manageToken, token))
		.returning();
	return row ?? null;
}

/** Every entry for /admin/waitlist: confirmed first, then pending, newest first within each. */
export async function listWaitlist() {
	const rows = await db.query.waitlistSignup.findMany({
		orderBy: [asc(waitlistSignup.status), desc(waitlistSignup.createdAt)],
		with: { inviteCode: { columns: { code: true, uses: true, maxUses: true, revokedAt: true } } },
	});
	const order: Record<string, number> = { confirmed: 0, pending: 1, invited: 2, removed: 3 };
	return rows.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
}

export function waitlistById(id: string) {
	return db.query.waitlistSignup.findFirst({ where: eq(waitlistSignup.id, id) });
}

/** An invite went out: the entry keeps the code it was sent. */
export async function markWaitlistInvited(id: string, inviteCodeId: string) {
	await db
		.update(waitlistSignup)
		.set({ status: "invited", invitedAt: new Date(), inviteCodeId })
		.where(eq(waitlistSignup.id, id));
}

export async function removeWaitlist(id: string) {
	const [row] = await db
		.delete(waitlistSignup)
		.where(eq(waitlistSignup.id, id))
		.returning({ id: waitlistSignup.id });
	return !!row;
}
