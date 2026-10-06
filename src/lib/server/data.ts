import {
	IdeaInstrumentsDataSchema,
	type IdeaInstruments,
	type IdeaKind,
} from "$lib/val/IdeaSchema";
import type { ReportKind, ReportVote } from "$lib/val/BugReportSchema";
import { reorderById } from "$lib/utils/reorderById";
import type { CreditRole } from "$lib/val/CreditRoleSchema";
import { flagProfanity } from "$lib/utils/profanity";
import type { ArtistKind } from "$lib/val/ArtistKindSchema";
import type { ImageKind } from "$lib/val/ImageSchema";
import type { ProjectType } from "$lib/val/ProjectTypeSchema";
import { FOUNDER_SEATS } from "$lib/constants/plans";
import type { StemManifest } from "$lib/audio/types";
import { DrumProjectSchema, type DrumProject } from "$lib/val/DrumPatternSchema";
import type { ProgressionData } from "$lib/val/ProgressionSchema";
import type { ChordStyleData } from "$lib/val/ChordStyleSchema";
import {
	NamedPianoPresetSchema,
	PIANO_PRESET_SLOTS,
	type NamedPianoPreset,
	type PianoPresetData,
	type PresetInstrument,
} from "$lib/val/PianoPresetSchema";
import {
	copyBlob,
	deleteBlobs,
	demoPathname,
	filePathname,
	projectFilePathname,
	notationPathname,
	drumSamplePathname,
	midiPathname,
	presentUrl,
	recordingAccess,
	recordingPathname,
	recordingStemPathname,
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
import { hashMarkdown, renderMarkdown } from "$lib/server/markdown";
import { labelFromFilename } from "$lib/utils/labelFromFilename";
import {
	FILE_CONTENT_TYPE_OF,
	MAX_FILES_PER_PROJECT,
	MAX_FILES_PER_SONG,
	type FileKind,
} from "$lib/constants/fileFormats";
import { demoContentType } from "$lib/utils/demoContentType";
import {
	MAX_NOTATION_PER_SONG,
	NOTATION_CONTENT_TYPE_OF,
	type NotationFormat,
} from "$lib/constants/notationFormats";
import { MAX_DEMOS_PER_SONG } from "$lib/constants/demoFormats";
import { MAX_STEMS_PER_SONG } from "$lib/constants/stemFormats";
import { slugify } from "$lib/utils/slugify";
import {
	isOverridableKit,
	MAX_DRUM_KITS_PER_ACCOUNT,
	OVERRIDABLE_KITS,
	type DrumKitManifest,
} from "$lib/constants/drumKits";
import { DRUM_KITS } from "$lib/constants/drumMachine";
import type { DrumVoiceId } from "$lib/constants/drumMachine";
import type { PermalinkKind } from "$lib/utils/permalink";
import {
	aliasedAccountSlugs,
	aliasTarget,
	claimSlug,
	recordSlugChange,
} from "$lib/server/slugAlias";
import { SlugSchema } from "$lib/val/SlugSchema";
import type { PlaybackStatus } from "$lib/val/PlaybackStatusSchema";
import { NOTES_STALE_MS } from "$lib/constants/notesStale";
import { MY_NOTES_KIND, type SongDocKind, type SongDocSaveKind } from "$lib/val/SongDocKindSchema";
import type { SongChange } from "$lib/val/SongChangeSchema";
import type { SongSection } from "$lib/val/SongSectionSchema";
import type { MemberRole } from "$lib/val/MemberRoleSchema";
import type { ProjectRole } from "$lib/val/ProjectRoleSchema";
import { INVITATION_TTL_MS, type InviteRole } from "$lib/val/InvitationSchema";
import { INVITE_CODE_ALPHABET, INVITE_CODE_LENGTH } from "$lib/val/InviteCodeSchema";
import type { BugStatus } from "$lib/val/BugReportSchema";
import type { AccountStatus } from "$lib/val/AccountStatusSchema";
import type { ShareGrant } from "$lib/server/viewAccess";
import type { Note } from "$lib/audio/chords";
import {
	like,
	and,
	asc,
	count,
	desc,
	eq,
	inArray,
	isNotNull,
	isNull,
	or,
	lt,
	ne,
	notExists,
	sql,
} from "drizzle-orm";
import type { SupportStatus } from "$lib/val/SupportRequestSchema";
import type { ReportPriority } from "$lib/val/BugReportSchema";
import { RELEASES_DOC_SLUG } from "$lib/constants/releasesDoc";
import type { UserDocKind } from "$lib/val/UserDocKindSchema";
import type { SignUpMode } from "$lib/val/SignUpModeSchema";
import { accountLimits, storageFits } from "$lib/utils/accountLimits";
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
	projectMember,
	song,
	stem,
	songDocVersion,
	songUserNote,
	demo,
	invitation,
	inviteCode,
	comment,
	commentVersion,
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
	recordingStem,
	drumKit,
	drumSample,
	idea,
	beat,
	pianoPreset,
	progression,
	chordStyle,
	songFile,
	songNotation,
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
	// An address another account had stays reserved for it (links to it may still be followed).
	const reservedBy = await aliasTarget("account", "", slug);
	if (reservedBy && reservedBy !== accountId) {
		return {
			ok: false,
			field: "slug",
			error: `"${slug}" belonged to another account and is reserved.`,
		};
	}
	const before = await db.query.account.findFirst({
		where: eq(account.id, accountId),
		columns: { slug: true },
	});
	const [row] = await db
		.update(account)
		.set({ name, slug })
		.where(eq(account.id, accountId))
		.returning();
	if (!row) return { ok: false, field: "name", error: "Account not found." };
	// The old address redirects here from now on (src/lib/server/slugAlias.ts).
	if (before) await recordSlugChange("account", "", accountId, before.slug, slug);
	return { ok: true, account: row };
}

// ---- limits -----------------------------------------------------------------

/** The account's limits (plan, founder, admin override): src/lib/utils/accountLimits.ts. */
export async function accountLimitsOf(accountId: string) {
	const row = await db.query.account.findFirst({
		where: eq(account.id, accountId),
		columns: { plan: true, isFounder: true, storageLimitBytes: true },
	});
	return row ? accountLimits(row) : null;
}

/**
 * Bytes of user files the account holds: stems, demos and takes, counting
 * reservations still uploading (so two uploads cannot both slip under the
 * line) and not failed ones. Renditions and mixes are derived, not counted.
 */
export async function accountStorageBytes(accountId: string) {
	const [stems] = await db
		.select({ bytes: sql<number | null>`sum(${stem.sizeBytes})` })
		.from(stem)
		.where(and(eq(stem.accountId, accountId), ne(stem.status, "failed")));
	const [demos] = await db
		.select({ bytes: sql<number | null>`sum(${demo.sizeBytes})` })
		.from(demo)
		.where(and(eq(demo.accountId, accountId), ne(demo.status, "failed")));
	const [takes] = await db
		.select({ bytes: sql<number | null>`sum(${recording.sizeBytes})` })
		.from(recording)
		.where(and(eq(recording.accountId, accountId), ne(recording.status, "failed")));
	// A multitrack take's sources (docs/demo-recording.md, "Multitrack takes") are files of the account too.
	const [takeStems] = await db
		.select({ bytes: sql<number | null>`sum(${recordingStem.sizeBytes})` })
		.from(recordingStem)
		.where(and(eq(recordingStem.accountId, accountId), ne(recordingStem.status, "failed")));
	// A custom kit's samples (docs/drum-machine.md, "Custom kits") are files of the account too.
	const [samples] = await db
		.select({ bytes: sql<number | null>`sum(${drumSample.sizeBytes})` })
		.from(drumSample)
		.where(and(eq(drumSample.accountId, accountId), ne(drumSample.status, "failed")));
	// Files attached to songs (docs/uploads-and-blob.md, "Attachments") count too; their thumbnails are derived.
	const [files] = await db
		.select({ bytes: sql<number | null>`sum(${songFile.sizeBytes})` })
		.from(songFile)
		.where(and(eq(songFile.accountId, accountId), ne(songFile.status, "failed")));
	// So do notation files (docs/uploads-and-blob.md, "Notation files").
	const [notation] = await db
		.select({ bytes: sql<number | null>`sum(${songNotation.sizeBytes})` })
		.from(songNotation)
		.where(and(eq(songNotation.accountId, accountId), ne(songNotation.status, "failed")));
	return (
		(stems.bytes ?? 0) +
		(demos.bytes ?? 0) +
		(takes.bytes ?? 0) +
		(takeStems.bytes ?? 0) +
		(samples.bytes ?? 0) +
		(files.bytes ?? 0) +
		(notation.bytes ?? 0)
	);
}

/** Before reserving an upload: does the file fit? The refusal carries what the page should say. */
export async function storageRoom(accountId: string, incomingBytes: number) {
	const limits = await accountLimitsOf(accountId);
	if (!limits || limits.storageBytes === null) return { ok: true as const };
	const used = await accountStorageBytes(accountId);
	if (storageFits(used, incomingBytes, limits.storageBytes)) return { ok: true as const };
	return { ok: false as const, used, limit: limits.storageBytes };
}

/** Seats: the account's members (owners, admins, members) against the plan's cap (null = unlimited); project viewers take none. */
export async function memberHeadroom(accountId: string) {
	const limits = await accountLimitsOf(accountId);
	const [row] = await db
		.select({ n: sql<number>`count(*)` })
		.from(accountMember)
		.where(eq(accountMember.accountId, accountId)); // viewers live on projects (0059), so every row is a seat
	const members = Number(row?.n ?? 0);
	const limit = limits?.members ?? null;
	return { members, limit, full: limit !== null && members >= limit };
}

/** A system admin raises (or clears) one account's storage limit; null = the plan's. */
export async function setAccountStorageLimit(accountId: string, bytes: number | null) {
	const [row] = await db
		.update(account)
		.set({ storageLimitBytes: bytes })
		.where(eq(account.id, accountId))
		.returning({ id: account.id });
	return !!row;
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
	const [takeStems] = await db
		.select({ bytes: sql<number | null>`sum(${recordingStem.sizeBytes})` })
		.from(recordingStem)
		.where(and(eq(recordingStem.accountId, accountId), eq(recordingStem.status, "ready")));
	const [demos] = await db
		.select({ n: sql<number>`count(*)`, bytes: sql<number | null>`sum(${demo.sizeBytes})` })
		.from(demo)
		.where(and(eq(demo.accountId, accountId), eq(demo.status, "ready")));
	const row = await db.query.account.findFirst({
		where: eq(account.id, accountId),
		with: { members: { with: { user: { columns: { name: true, email: true } } } } },
	});
	const limits = row ? accountLimits(row) : { storageBytes: null, members: null };
	return {
		projects: projects.n,
		songs: songs.n,
		stems: stems.n,
		recordings: recordings.n,
		demos: demos.n,
		/** Stems, demos and takes that are ready; renditions and mixes are not counted. */
		bytes:
			(stems.bytes ?? 0) + ((recordings.bytes ?? 0) + (takeStems.bytes ?? 0)) + (demos.bytes ?? 0),
		/** null = unlimited (a founder account). */
		storageLimitBytes: limits.storageBytes,
		memberLimit: limits.members,
		isFounder: row?.isFounder ?? false,
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
	await claimSlug("project", accountId, row.slug); // a live slug outranks an old address
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
	const before = await db.query.project.findFirst({
		where: and(eq(project.accountId, accountId), eq(project.id, projectId)),
		columns: { slug: true },
	});
	const [row] = await db
		.update(project)
		.set({ name, slug, type: input.type })
		.where(and(eq(project.accountId, accountId), eq(project.id, projectId)))
		.returning();
	if (!row) return { ok: false, field: "name", error: "Project not found." };
	// The old address redirects here from now on (src/lib/server/slugAlias.ts).
	if (before) await recordSlugChange("project", accountId, projectId, before.slug, slug);
	return { ok: true, project: row };
}

/** Account + project slugs of a project by id, scoped to the account. */
export async function projectSlugs(accountId: string, projectId: string) {
	const row = await db.query.project.findFirst({
		where: and(eq(project.accountId, accountId), eq(project.id, projectId)),
		columns: { slug: true, name: true },
		with: { account: { columns: { slug: true } } },
	});
	return row ? { account: row.account.slug, project: row.slug, projectName: row.name } : null;
}

/** The project a viewer invitation is for (revoking it from the project's settings). */
export async function invitationProject(id: string) {
	const row = await db.query.invitation.findFirst({
		where: eq(invitation.id, id),
		columns: { projectId: true },
	});
	return row?.projectId ? { projectId: row.projectId } : null;
}

/** The project a song is in, scoped to the account (an attachment reserved by song takes its project from here). */
export async function projectOfSong(accountId: string, songId: string) {
	const row = await db.query.song.findFirst({
		where: and(eq(song.accountId, accountId), eq(song.id, songId)),
		columns: { projectId: true },
	});
	return row ? { projectId: row.projectId } : null;
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
					demos: {
						columns: {
							id: true,
							status: true,
							label: true,
							url: true,
							playbackStatus: true,
							playbackUrl: true,
						},
						orderBy: [asc(demo.createdAt)],
					},
					// The project page's tiles count a song's charts: its scores and the files marked as notation.
					files: { columns: { id: true, status: true, isNotation: true, kind: true } },
					notation: { columns: { id: true, status: true } },
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
	// A new song goes last: the project's order is the members' (reorderSongs), and it holds.
	const [last] = await db
		.select({ last: sql<number | null>`max(${song.sortOrder})` })
		.from(song)
		.where(eq(song.projectId, projectId));
	const [row] = await db
		.insert(song)
		.values({
			accountId,
			projectId,
			title: title.trim(),
			slug: uniqueSlug(base, taken),
			createdBy: userId,
			sortOrder: (last?.last ?? -1) + 1,
		})
		.returning();
	await claimSlug("song", projectId, row.slug); // a live slug outranks an old address
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
		columns: { id: true, projectId: true, slug: true },
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
	// The old address redirects here from now on (src/lib/server/slugAlias.ts).
	await recordSlugChange("song", existing.projectId, songId, existing.slug, slug);
	return { ok: true, song: row };
}

export async function getSong(accountId: string, projectSlug: string, songSlug: string) {
	const proj = await db.query.project.findFirst({
		where: and(eq(project.accountId, accountId), eq(project.slug, projectSlug)),
		columns: { id: true, name: true, slug: true, isPrivate: true, isRestricted: true, noAi: true },
	});
	if (!proj) return null;
	const row = await db.query.song.findFirst({
		where: and(eq(song.projectId, proj.id), eq(song.slug, songSlug)),
		with: {
			stems: { orderBy: [asc(stem.sortOrder), asc(stem.createdAt)] },
			demos: { orderBy: [asc(demo.createdAt)] },
			files: { orderBy: [asc(songFile.createdAt)] },
			notation: { orderBy: [asc(songNotation.createdAt)] },
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
		files: { url: string; thumbnailUrl: string | null }[];
		notation: { url: string; thumbnailUrl: string | null }[];
	},
>(s: S): Promise<S> {
	return {
		...s,
		notation: await Promise.all(
			s.notation.map(async (n) => ({
				...n,
				url: (await presentUrl(n.url)) ?? n.url,
				thumbnailUrl: await presentUrl(n.thumbnailUrl),
			})),
		),
		files: await Promise.all(
			s.files.map(async (f) => ({
				...f,
				url: (await presentUrl(f.url)) ?? f.url,
				thumbnailUrl: await presentUrl(f.thumbnailUrl),
			})),
		),
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
	const files = await db
		.select({ url: songFile.url, thumbnailUrl: songFile.thumbnailUrl })
		.from(songFile)
		.where(and(eq(songFile.accountId, accountId), eq(songFile.songId, songId)));
	const notation = await db
		.select({
			url: songNotation.url,
			thumbnailUrl: songNotation.thumbnailUrl,
			pdfUrl: songNotation.pdfUrl,
		})
		.from(songNotation)
		.where(and(eq(songNotation.accountId, accountId), eq(songNotation.songId, songId)));
	await deleteBlobs([
		...rows.flatMap((r) => [r.url, r.playbackUrl ?? "", r.midiUrl ?? ""]),
		...demos.flatMap((d) => [d.url, d.playbackUrl ?? ""]),
		...files.flatMap((f) => [f.url, f.thumbnailUrl ?? ""]),
		...notation.flatMap((n) => [n.url, n.thumbnailUrl ?? "", n.pdfUrl ?? ""]),
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

/** The project's songs in the given order, top first; ids from elsewhere are ignored, songs left out keep their place after the named ones. */
export async function reorderSongs(accountId: string, projectId: string, ids: string[]) {
	const rows = await db.query.song.findMany({
		where: and(eq(song.accountId, accountId), eq(song.projectId, projectId)),
		columns: { id: true, sortOrder: true },
		orderBy: [asc(song.sortOrder), asc(song.title)],
	});
	const ordered = reorderById(rows, ids);
	await Promise.all(
		ordered
			.map((row, i) => ({ row, i }))
			.filter(({ row, i }) => row.sortOrder !== i)
			.map(({ row, i }) =>
				db
					.update(song)
					.set({ sortOrder: i })
					.where(and(eq(song.accountId, accountId), eq(song.id, row.id))),
			),
	);
	return ordered.map((row) => row.id);
}

/** The song's stems in the given order, top first; ids from other songs are ignored, stems left out keep their place after the named ones. */
export async function reorderStems(accountId: string, songId: string, ids: string[]) {
	const rows = await db.query.stem.findMany({
		where: and(eq(stem.accountId, accountId), eq(stem.songId, songId)),
		columns: { id: true, sortOrder: true },
		orderBy: [asc(stem.sortOrder), asc(stem.createdAt)],
	});
	const ordered = reorderById(rows, ids);
	await Promise.all(
		ordered
			.map((row, i) => ({ row, i }))
			.filter(({ row, i }) => row.sortOrder !== i)
			.map(({ row, i }) =>
				db
					.update(stem)
					.set({ sortOrder: i })
					.where(and(eq(stem.accountId, accountId), eq(stem.id, row.id))),
			),
	);
	return ordered.map((row) => row.id);
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

/** The ten most recent replaced texts of a comment are kept (comment_version). */
const COMMENT_VERSIONS_TO_KEEP = 10;

/**
 * Edits a comment (the caller has checked they may); stamps editedAt. The
 * text it replaces goes to comment_version first, with `editedBy` the
 * person replacing it, so the edit can be undone (history.remote.ts); an
 * edit that changes nothing writes no revision. The newest
 * COMMENT_VERSIONS_TO_KEEP revisions are kept.
 */
export async function updateComment(id: string, input: CommentInput, editedBy?: string) {
	const current = await db.query.comment.findFirst({
		where: eq(comment.id, id),
		columns: { id: true, title: true, body: true, at: true },
	});
	if (!current) return null;
	const changed =
		current.title !== input.title || current.body !== input.body || current.at !== input.at;
	if (changed) {
		await db.insert(commentVersion).values({
			commentId: id,
			title: current.title,
			body: current.body,
			at: current.at,
			editedBy: editedBy ?? null,
		});
	}
	const [row] = await db
		.update(comment)
		.set({ title: input.title, body: input.body, at: input.at, editedAt: new Date() })
		.where(eq(comment.id, id))
		.returning({ id: comment.id });
	if (changed) {
		const stale = await db
			.select({ id: commentVersion.id })
			.from(commentVersion)
			.where(eq(commentVersion.commentId, id))
			.orderBy(desc(commentVersion.createdAt), desc(commentVersion.id))
			.limit(1000)
			.offset(COMMENT_VERSIONS_TO_KEEP);
		if (stale.length > 0) {
			await db.delete(commentVersion).where(
				inArray(
					commentVersion.id,
					stale.map((r) => r.id),
				),
			);
		}
	}
	return row ?? null;
}

/** A comment's revisions, newest first, with who replaced each text (history.remote.ts). */
export async function listCommentVersions(commentId: string) {
	const rows = await db.query.commentVersion.findMany({
		where: eq(commentVersion.commentId, commentId),
		orderBy: [desc(commentVersion.createdAt), desc(commentVersion.id)],
		limit: COMMENT_VERSIONS_TO_KEEP,
		with: { editor: { columns: { name: true } } },
	});
	return rows.map((r) => ({
		id: r.id,
		title: r.title,
		body: r.body,
		at: r.at,
		createdAt: r.createdAt.getTime(),
		editedBy: r.editor ? { name: r.editor.name } : null,
	}));
}

/** One revision of a comment, by both ids so a revision of another comment is "not found". */
export async function commentVersionById(commentId: string, versionId: string) {
	const row = await db.query.commentVersion.findFirst({
		where: and(eq(commentVersion.commentId, commentId), eq(commentVersion.id, versionId)),
		columns: { id: true, title: true, body: true, at: true },
	});
	return row ?? null;
}

/** Removes a comment and its revisions (Turso runs no cascades). */
export async function deleteComment(id: string) {
	await db.delete(commentVersion).where(eq(commentVersion.commentId, id));
	const [row] = await db.delete(comment).where(eq(comment.id, id)).returning({ id: comment.id });
	return !!row;
}

// ---- project people ---------------------------------------------------------

/** The person's role on each project of the account they were added to (docs/auth.md). */
export async function projectRolesOf(
	accountId: string,
	userId: string,
): Promise<Record<string, ProjectRole>> {
	const rows = await db
		.select({ projectId: projectMember.projectId, role: projectMember.role })
		.from(projectMember)
		.innerJoin(project, eq(project.id, projectMember.projectId))
		.where(and(eq(project.accountId, accountId), eq(projectMember.userId, userId)));
	return Object.fromEntries(rows.map((r) => [r.projectId, r.role]));
}

export async function projectRoleOf(
	projectId: string,
	userId: string,
): Promise<ProjectRole | null> {
	const row = await db.query.projectMember.findFirst({
		where: and(eq(projectMember.projectId, projectId), eq(projectMember.userId, userId)),
		columns: { role: true },
	});
	return row?.role ?? null;
}

export async function projectRestricted(projectId: string): Promise<boolean> {
	const row = await db.query.project.findFirst({
		where: eq(project.id, projectId),
		columns: { isRestricted: true },
	});
	return row?.isRestricted ?? false;
}

/** Everyone added to the project, and the viewer invitations still open, for its settings. */
export async function listProjectPeople(accountId: string, projectId: string) {
	const owned = await db.query.project.findFirst({
		where: and(eq(project.accountId, accountId), eq(project.id, projectId)),
		columns: { id: true },
	});
	if (!owned) return { people: [], invitations: [] };
	const [people, invitations] = await Promise.all([
		db.query.projectMember.findMany({
			where: eq(projectMember.projectId, projectId),
			with: { user: { columns: { id: true, name: true, email: true } } },
			orderBy: [asc(projectMember.createdAt)],
		}),
		db.query.invitation.findMany({
			where: and(
				eq(invitation.projectId, projectId),
				isNull(invitation.acceptedAt),
				isNull(invitation.revokedAt),
			),
			orderBy: [desc(invitation.createdAt)],
			columns: { id: true, email: true, expiresAt: true, createdAt: true },
		}),
	]);
	return {
		people: people.map((m) => ({
			userId: m.userId,
			name: m.user.name,
			email: m.user.email,
			role: m.role,
			since: m.createdAt,
		})),
		invitations: invitations.filter((i) => i.expiresAt.getTime() > Date.now()),
	};
}

/** The account's members (for adding one to a restricted project). */
export function listAccountMembers(accountId: string) {
	return db.query.accountMember
		.findMany({
			where: eq(accountMember.accountId, accountId),
			with: { user: { columns: { id: true, name: true, email: true } } },
		})
		.then((rows) =>
			rows.map((m) => ({ userId: m.userId, name: m.user.name, email: m.user.email, role: m.role })),
		);
}

/** Adds a member of the account to the project (what a restricted project needs); owners and admins are on every project already. */
export async function addProjectMember(
	accountId: string,
	projectId: string,
	userId: string,
	addedBy: string,
) {
	const owned = await db.query.project.findFirst({
		where: and(eq(project.accountId, accountId), eq(project.id, projectId)),
		columns: { id: true },
	});
	if (!owned) return { ok: false as const, error: "Project not found." };
	const m = await db.query.accountMember.findFirst({
		where: and(eq(accountMember.accountId, accountId), eq(accountMember.userId, userId)),
	});
	if (!m) return { ok: false as const, error: "Not a member of this account." };
	if (m.role === "owner" || m.role === "admin")
		return { ok: false as const, error: "Owners and admins are on every project already." };
	const there = await db.query.projectMember.findFirst({
		where: and(eq(projectMember.projectId, projectId), eq(projectMember.userId, userId)),
	});
	if (there) {
		if (there.role === "member") return { ok: true as const, already: true };
		await db.update(projectMember).set({ role: "member" }).where(eq(projectMember.id, there.id));
		return { ok: true as const, already: false };
	}
	await db.insert(projectMember).values({ projectId, userId, role: "member", addedBy });
	return { ok: true as const, already: false };
}

export async function removeProjectPerson(accountId: string, projectId: string, userId: string) {
	const owned = await db.query.project.findFirst({
		where: and(eq(project.accountId, accountId), eq(project.id, projectId)),
		columns: { id: true },
	});
	if (!owned) return false;
	const [row] = await db
		.delete(projectMember)
		.where(and(eq(projectMember.projectId, projectId), eq(projectMember.userId, userId)))
		.returning({ id: projectMember.id });
	return !!row;
}

export async function setProjectRestricted(
	accountId: string,
	projectId: string,
	restricted: boolean,
) {
	const [row] = await db
		.update(project)
		.set({ isRestricted: restricted })
		.where(and(eq(project.accountId, accountId), eq(project.id, projectId)))
		.returning({ id: project.id });
	return !!row;
}

// ---- invitations ------------------------------------------------------------

/**
 * A fresh invitation for `email`: into the account with a role, or (with
 * `projectId`) to view one project from outside the account, which takes
 * no seat. The token is the link.
 */
export async function createInvitation(
	accountId: string,
	invitedBy: string,
	email: string,
	role: MemberRole | "viewer",
	projectId: string | null = null,
) {
	const address = email.trim().toLowerCase();
	if (projectId) {
		const people = await db.query.projectMember.findMany({
			where: eq(projectMember.projectId, projectId),
			with: { user: { columns: { email: true } } },
		});
		if (people.some((m) => m.user.email.toLowerCase() === address)) return "member" as const;
	} else {
		const members = await db.query.accountMember.findMany({
			where: eq(accountMember.accountId, accountId),
			with: { user: { columns: { email: true } } },
		});
		if (members.some((m) => m.user.email.toLowerCase() === address)) return "member" as const;
		if ((await memberHeadroom(accountId)).full) return "full" as const;
	}
	const [row] = await db
		.insert(invitation)
		.values({
			accountId,
			projectId,
			email: address,
			role: projectId ? "viewer" : role,
			token: nanoid(32),
			invitedBy,
			expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
		})
		.returning();
	return row;
}

/** Open invitations into the account, for its settings page (a project's viewer invitations list on the project). */
export function pendingInvitations(accountId: string) {
	return db.query.invitation.findMany({
		where: and(
			eq(invitation.accountId, accountId),
			isNull(invitation.projectId),
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
		with: {
			account: { columns: { id: true, name: true, slug: true } },
			project: { columns: { id: true, name: true, slug: true } },
		},
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
	if (inv.projectId) {
		// A project viewer: added to the project, not the account; no seat.
		const there = await db.query.projectMember.findFirst({
			where: and(eq(projectMember.projectId, inv.projectId), eq(projectMember.userId, user.id)),
		});
		if (!there) {
			await db.insert(projectMember).values({
				projectId: inv.projectId,
				userId: user.id,
				role: "viewer",
				addedBy: inv.invitedBy,
			});
		}
		await db.update(invitation).set({ acceptedAt: new Date() }).where(eq(invitation.id, inv.id));
		return {
			status: "joined" as const,
			account: inv.account,
			project: inv.project,
			invitedBy: inv.invitedBy,
		};
	}
	const existing = await db.query.accountMember.findFirst({
		where: and(eq(accountMember.accountId, inv.accountId), eq(accountMember.userId, user.id)),
	});
	if (!existing) {
		if ((await memberHeadroom(inv.accountId)).full) return "full" as const;
		await db
			.insert(accountMember)
			.values({ accountId: inv.accountId, userId: user.id, role: inv.role as MemberRole });
	}
	await db.update(invitation).set({ acceptedAt: new Date() }).where(eq(invitation.id, inv.id));
	return {
		status: "joined" as const,
		account: inv.account,
		project: null,
		invitedBy: inv.invitedBy,
	};
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
			if ((await memberHeadroom(row.accountId)).full) return "full" as const;
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
			storageLimitBytes: a.storageLimitBytes,
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
	const flags = flagProfanity(`${input.title}\n${input.body}`);
	const [row] = await db
		.insert(bugReport)
		.values({ userId, ...input, contactEmail: input.contactEmail || null, flags: flags.join(",") })
		.returning();
	return row;
}

/** Shows a feature request on the public page (or hides it again). */
export async function setBugReportApproval(id: string, approved: boolean) {
	const [row] = await db
		.update(bugReport)
		.set({ approvedAt: approved ? new Date() : null })
		.where(eq(bugReport.id, id))
		.returning({ id: bugReport.id });
	return !!row;
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
 * Feature requests as the public page shows them: approved ones, plus the
 * viewer's own while they wait (and all of them for an admin); no reporter,
 * each with its vote tally and the viewer's own thumbs; open ones by score
 * (then newest), then complete, then closed.
 */
export async function listFeatureRequestsPublic(userId: string | null, everything = false) {
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
			approvedAt: true,
			userId: true,
		},
		with: { votes: { columns: { value: true, userId: true } } },
	});
	return rows
		.filter((r) => everything || r.approvedAt || (userId && r.userId === userId))
		.map(({ votes, userId: reporterId, approvedAt, ...r }) => {
			const own = votes.find((v) => v.userId === userId);
			const mine: ReportVote = own ? (own.value > 0 ? "up" : "down") : "none";
			return {
				...r,
				approved: !!approvedAt,
				mine: !!userId && reporterId === userId,
				votes: tally(votes, mine),
			};
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

// ---- passkeys ---------------------------------------------------------------

/** The user's registered passkeys for the Security page; the plugin itself adds and removes them. */
export function listPasskeys(userId: string) {
	return db.query.passkey.findMany({
		where: eq(schema.passkey.userId, userId),
		orderBy: [desc(schema.passkey.createdAt)],
		columns: { id: true, name: true, deviceType: true, backedUp: true, createdAt: true },
	});
}

// ---- user docs --------------------------------------------------------------

/** The documentation pages in reading order, without the markdown or the release notes (they have their own page, /releases). */
export function listUserDocs() {
	return db.query.userDoc.findMany({
		where: and(eq(userDoc.kind, "doc"), ne(userDoc.slug, RELEASES_DOC_SLUG)),
		orderBy: [asc(userDoc.sortOrder), asc(userDoc.title)],
		columns: { id: true, slug: true, title: true, sortOrder: true, version: true, updatedAt: true },
	});
}

/** The blog posts, newest first; drafts (unpublished) only when asked, for a system admin. */
export function listBlogPosts(includeDrafts = false) {
	return db.query.userDoc.findMany({
		where: includeDrafts
			? eq(userDoc.kind, "post")
			: and(eq(userDoc.kind, "post"), isNotNull(userDoc.publishedAt)),
		orderBy: [desc(userDoc.publishedAt), desc(userDoc.createdAt)],
		columns: {
			id: true,
			slug: true,
			title: true,
			markdown: true,
			publishedAt: true,
			version: true,
			updatedAt: true,
		},
		with: { editor: { columns: { name: true } } },
	});
}

export function getUserDoc(slug: string) {
	return db.query.userDoc.findFirst({
		where: eq(userDoc.slug, slug),
		with: { editor: { columns: { name: true } } },
	});
}

export async function createUserDoc(userId: string, title: string, kind: UserDocKind = "doc") {
	const taken = new Set((await db.select({ slug: userDoc.slug }).from(userDoc)).map((r) => r.slug));
	const [row] = await db
		.insert(userDoc)
		.values({ title, kind, slug: uniqueSlug(slugify(title) || kind, taken), updatedBy: userId })
		.returning();
	return row;
}

/** Title, address and order; for a post also whether it is published (the date is set once, on first publishing). */
export async function updateUserDocMeta(
	id: string,
	meta: { title: string; slug: string; sortOrder: number; published?: boolean },
) {
	const existing = await db.query.userDoc.findFirst({ where: eq(userDoc.id, id) });
	if (!existing) return { ok: false as const, error: "Page not found." };
	const clash = await db.query.userDoc.findFirst({ where: eq(userDoc.slug, meta.slug) });
	if (clash && clash.id !== id)
		return { ok: false as const, error: "Another page has that address." };
	const { published, ...rest } = meta;
	const publishedAt =
		existing.kind === "post"
			? published
				? (existing.publishedAt ?? new Date())
				: null
			: undefined;
	const [row] = await db
		.update(userDoc)
		.set({ ...rest, ...(publishedAt === undefined ? {} : { publishedAt }) })
		.where(eq(userDoc.id, id))
		.returning();
	return row ? { ok: true as const, doc: row } : { ok: false as const, error: "Page not found." };
}

/** Removes a page or post and its versions; returns what it was (the caller picks where to go). */
export async function deleteUserDoc(id: string) {
	const row = await db.query.userDoc.findFirst({
		where: eq(userDoc.id, id),
		columns: { id: true, kind: true },
	});
	if (!row) return null;
	await deleteUserDocRows([id]);
	return row;
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

/** The current page of a song, a project or an account by id (`/go/<kind>/<id>`, src/lib/utils/permalink.ts), or null. */
export async function permalinkTarget(kind: PermalinkKind, id: string): Promise<string | null> {
	if (kind === "song") {
		const s = await db.query.song.findFirst({
			where: eq(song.id, id),
			columns: { slug: true },
			with: {
				project: { columns: { slug: true }, with: { account: { columns: { slug: true } } } },
			},
		});
		return s ? `/${s.project.account.slug}/projects/${s.project.slug}/${s.slug}` : null;
	}
	if (kind === "project") {
		const p = await db.query.project.findFirst({
			where: eq(project.id, id),
			columns: { slug: true },
			with: { account: { columns: { slug: true } } },
		});
		return p ? `/${p.account.slug}/projects/${p.slug}` : null;
	}
	const a = await db.query.account.findFirst({
		where: eq(account.id, id),
		columns: { slug: true },
	});
	return a ? `/${a.slug}` : null;
}

/** The current page of the song or project a code was made for (`/s/<code>`), or null when no such code. */
export async function shareLinkTarget(code: string): Promise<string | null> {
	const link = await db.query.shareLink.findFirst({
		where: eq(shareLink.code, code),
		columns: { songId: true, projectId: true },
	});
	if (!link) return null;
	if (link.songId) {
		const s = await db.query.song.findFirst({
			where: eq(song.id, link.songId),
			columns: { slug: true },
			with: {
				project: { columns: { slug: true }, with: { account: { columns: { slug: true } } } },
			},
		});
		return s ? `/${s.project.account.slug}/projects/${s.project.slug}/${s.slug}` : null;
	}
	if (link.projectId) {
		const p = await db.query.project.findFirst({
			where: eq(project.id, link.projectId),
			columns: { slug: true },
			with: { account: { columns: { slug: true } } },
		});
		return p ? `/${p.account.slug}/projects/${p.slug}` : null;
	}
	return null;
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
	const samples = await db
		.select({ url: drumSample.url })
		.from(drumSample)
		.where(eq(drumSample.accountId, id));
	await deleteBlobs([
		...stems.flatMap((r) => [r.url, r.playbackUrl ?? "", r.midiUrl ?? ""]),
		...demos.flatMap((d) => [d.url, d.playbackUrl ?? ""]),
		...recordings.flatMap((r) => [r.url, r.playbackUrl ?? ""]),
		...samples.map((smp) => smp.url),
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
	// Addresses accounts used to have stay reserved for them.
	const reserved = new Set(await aliasedAccountSlugs());
	let slug = base;
	for (let n = 2; taken.has(slug) || reserved.has(slug); n++) slug = `${base.slice(0, 60)}-${n}`;
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
	kind: "stem" | "midi" | "demo" | "recording" | "recording-stem" | "file" | "notation",
	id: string,
): Promise<string | null> {
	if (kind === "notation") {
		const r = await db.query.songNotation.findFirst({
			where: and(eq(songNotation.accountId, accountId), eq(songNotation.id, id)),
			columns: { pathname: true },
		});
		return r?.pathname ?? null;
	}
	if (kind === "file") {
		const r = await db.query.songFile.findFirst({
			where: and(eq(songFile.accountId, accountId), eq(songFile.id, id)),
			columns: { pathname: true },
		});
		return r?.pathname ?? null;
	}
	if (kind === "recording-stem") {
		const r = await db.query.recordingStem.findFirst({
			where: and(eq(recordingStem.accountId, accountId), eq(recordingStem.id, id)),
			columns: { pathname: true },
		});
		return r?.pathname ?? null;
	}
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

// ---- Files attached to projects and songs (docs/uploads-and-blob.md, "Attachments") ----

/** Whether a song, or the project itself (its own files, not its songs'), has room for one more file under its cap. */
async function fileRoom(projectId: string, songId: string | null): Promise<boolean> {
	const [{ n }] = await db
		.select({ n: sql<number>`count(*)` })
		.from(songFile)
		.where(
			songId
				? eq(songFile.songId, songId)
				: and(eq(songFile.projectId, projectId), isNull(songFile.songId)),
		);
	return n < (songId ? MAX_FILES_PER_SONG : MAX_FILES_PER_PROJECT);
}

/**
 * Step 1 of an attachment upload: the row in `uploading` state with its
 * kind, pathname and share code. A song-level file (`songId` set) lives
 * under the song's folder and counts against the song's cap; a
 * project-level one (`songId` null) under the project's folder and against
 * the project's, and is never a score. Null for a project or song the
 * account lacks (or a song outside the project), "full" at the cap.
 */
export async function createFile(input: {
	accountId: string;
	userId: string;
	projectId: string;
	songId: string | null;
	filename: string;
	sizeBytes: number;
	kind: FileKind;
	isNotation?: boolean;
}) {
	const { accountId, userId, projectId, songId } = input;
	const p = await db.query.project.findFirst({
		where: and(eq(project.accountId, accountId), eq(project.id, projectId)),
		columns: { id: true },
	});
	if (!p) return null;
	if (songId && !(await songInProject(accountId, projectId, songId))) return null;
	if (!(await fileRoom(projectId, songId))) return "full" as const;
	const id = nanoid();
	const [row] = await db
		.insert(songFile)
		.values({
			id,
			accountId,
			projectId,
			songId,
			kind: input.kind,
			title: labelFromFilename(input.filename),
			isNotation: songId ? (input.isNotation ?? false) : false,
			url: "",
			pathname: songId
				? filePathname(accountId, songId, id, input.filename)
				: projectFilePathname(accountId, projectId, id, input.filename),
			filename: input.filename,
			sizeBytes: input.sizeBytes,
			shareCode: nanoid(16),
			uploadedBy: userId,
		})
		.returning();
	return row;
}

async function songInProject(accountId: string, projectId: string, songId: string) {
	const s = await db.query.song.findFirst({
		where: and(eq(song.accountId, accountId), eq(song.projectId, projectId), eq(song.id, songId)),
		columns: { id: true },
	});
	return !!s;
}

/**
 * Moves a file to a song of its project, or back to the project level
 * (`songId` null). The blob stays where it is: pathnames are ID-based and
 * the share code is the permanent address. A file leaving a song is no
 * longer a score (`isNotation` cleared). Null for a file the account lacks
 * or a song outside the file's project, "full" when the target has no room.
 */
export async function attachFile(accountId: string, fileId: string, songId: string | null) {
	const f = await db.query.songFile.findFirst({
		where: and(eq(songFile.accountId, accountId), eq(songFile.id, fileId)),
	});
	if (!f) return null;
	if (f.songId === songId) return f;
	if (songId && !(await songInProject(accountId, f.projectId, songId))) return null;
	if (!(await fileRoom(f.projectId, songId))) return "full" as const;
	const [row] = await db
		.update(songFile)
		.set({ songId, isNotation: f.songId ? false : f.isNotation })
		.where(and(eq(songFile.accountId, accountId), eq(songFile.id, fileId)))
		.returning();
	return row ?? null;
}

/** A file's URLs as a page may send them (presigned for a private store), like `presentSongFiles`. */
async function presentFile<F extends { url: string; thumbnailUrl: string | null }>(
	f: F,
): Promise<F> {
	return {
		...f,
		url: (await presentUrl(f.url)) ?? f.url,
		thumbnailUrl: await presentUrl(f.thumbnailUrl),
	};
}

/**
 * The project page's library (docs/uploads-and-blob.md, "Attachments"):
 * every ready file of the project, song-level and project-level, newest
 * first, each with the song it is attached to (null at the project level)
 * and URLs the browser may fetch.
 */
export async function listProjectFiles(accountId: string, projectId: string) {
	const rows = await db.query.songFile.findMany({
		where: and(
			eq(songFile.accountId, accountId),
			eq(songFile.projectId, projectId),
			eq(songFile.status, "ready"),
		),
		orderBy: [desc(songFile.createdAt)],
		with: { song: { columns: { id: true, title: true, slug: true } } },
	});
	return Promise.all(rows.map((r) => presentFile({ ...r, song: r.song ?? null })));
}

/**
 * The project's scores (docs/uploads-and-blob.md, "Notation files"): every
 * ready notation file of the project's active songs, newest first, with
 * its song and the state of its rendered PDF, URLs presented (the PDF's
 * only once it is ready).
 */
export async function listProjectScores(accountId: string, projectId: string) {
	const songs = await db
		.select({ id: song.id })
		.from(song)
		.where(
			and(eq(song.accountId, accountId), eq(song.projectId, projectId), eq(song.status, "active")),
		);
	if (songs.length === 0) return [];
	const rows = await db.query.songNotation.findMany({
		where: and(
			eq(songNotation.accountId, accountId),
			inArray(
				songNotation.songId,
				songs.map((s) => s.id),
			),
			eq(songNotation.status, "ready"),
		),
		orderBy: [desc(songNotation.createdAt)],
		with: { song: { columns: { id: true, title: true, slug: true } } },
	});
	return Promise.all(
		rows.map(async (n) => ({
			...(await presentFile(n)),
			pdfUrl: n.pdfStatus === "ready" ? await presentUrl(n.pdfUrl) : null,
		})),
	);
}

/**
 * What the documentation PDF needs of a song (src/lib/server/documentation.ts),
 * unscoped by id like `songForMix`: the route checks the view rules on it.
 */
export async function songForDocumentation(songId: string) {
	const row = await db.query.song.findFirst({
		where: and(eq(song.id, songId), eq(song.status, "active")),
		columns: {
			id: true,
			accountId: true,
			projectId: true,
			isPrivate: true,
			title: true,
			version: true,
			lyricsMarkdown: true,
			chartMarkdown: true,
			notesMarkdown: true,
		},
		with: {
			project: { columns: { name: true, isPrivate: true, isRestricted: true } },
			// Its notation, merged after the text (documentation.ts, `notationPartsOf`).
			notation: {
				where: eq(songNotation.status, "ready"),
				orderBy: [asc(songNotation.createdAt)],
				columns: { id: true, pdfUrl: true, pdfStatus: true },
			},
			files: {
				where: and(eq(songFile.status, "ready"), eq(songFile.isNotation, true)),
				orderBy: [asc(songFile.createdAt)],
				columns: { id: true, url: true, kind: true, filename: true },
			},
		},
	});
	return row ?? null;
}

/**
 * What the project downloads need (src/lib/server/documentation.ts): the
 * project with its active songs in page order, each with its documents,
 * its ready scores and the files marked as notation. Scoped to the account.
 */
export async function projectForDocumentation(accountId: string, projectId: string) {
	const row = await db.query.project.findFirst({
		where: and(eq(project.accountId, accountId), eq(project.id, projectId)),
		columns: { id: true, name: true, slug: true, isPrivate: true, isRestricted: true },
		with: {
			songs: {
				where: eq(song.status, "active"),
				orderBy: [asc(song.sortOrder), asc(song.title)],
				columns: {
					id: true,
					projectId: true,
					isPrivate: true,
					title: true,
					slug: true,
					version: true,
					lyricsMarkdown: true,
					chartMarkdown: true,
					notesMarkdown: true,
				},
				with: {
					notation: {
						where: eq(songNotation.status, "ready"),
						orderBy: [asc(songNotation.createdAt)],
						columns: {
							id: true,
							title: true,
							filename: true,
							url: true,
							pdfUrl: true,
							pdfStatus: true,
						},
					},
					files: {
						where: and(eq(songFile.status, "ready"), eq(songFile.isNotation, true)),
						orderBy: [asc(songFile.createdAt)],
						columns: { id: true, title: true, filename: true, url: true, kind: true },
					},
				},
			},
		},
	});
	return row ?? null;
}

/** The reserved row's pathname and kind, for the ready route to check the stored bytes against. */
export async function findFileById(accountId: string, fileId: string) {
	const row = await db.query.songFile.findFirst({
		where: and(eq(songFile.accountId, accountId), eq(songFile.id, fileId)),
		columns: { pathname: true, kind: true },
	});
	return row ?? null;
}

export function findUploadingFile(accountId: string, pathname: string) {
	return db.query.songFile.findFirst({
		where: and(
			eq(songFile.accountId, accountId),
			eq(songFile.pathname, pathname),
			eq(songFile.status, "uploading"),
		),
	});
}

/** Vercel's completion webhook (production only): the URL lands even if the browser's own report never does; the bytes are checked when it does. */
export async function recordFileUrl(pathname: string, url: string) {
	await db
		.update(songFile)
		.set({ url })
		.where(and(eq(songFile.pathname, pathname), eq(songFile.status, "uploading")));
}

/** Step 3: the file checked, the thumbnail stored, the row ready. */
export async function markFileReady(
	accountId: string,
	fileId: string,
	data: {
		url: string;
		pageCount: number | null;
		thumbnailUrl: string | null;
		thumbnailPathname: string | null;
	},
) {
	const [row] = await db
		.update(songFile)
		.set({ ...data, status: "ready" })
		.where(and(eq(songFile.accountId, accountId), eq(songFile.id, fileId)))
		.returning();
	return row ?? null;
}

/** The upload was not what its name said (or never finished): the row goes, and whatever landed. */
export async function failFile(accountId: string, fileId: string) {
	const [row] = await db
		.delete(songFile)
		.where(and(eq(songFile.accountId, accountId), eq(songFile.id, fileId)))
		.returning({ url: songFile.url, thumbnailUrl: songFile.thumbnailUrl });
	if (row) await deleteBlobs([row.url, row.thumbnailUrl ?? ""]);
}

/** Title and description; `isNotation` only when the caller sets it. */
export async function updateFile(
	accountId: string,
	fileId: string,
	fields: { title: string; description: string; isNotation?: boolean },
) {
	const { isNotation, ...words } = fields;
	const [row] = await db
		.update(songFile)
		.set(isNotation === undefined ? words : { ...words, isNotation })
		.where(and(eq(songFile.accountId, accountId), eq(songFile.id, fileId)))
		.returning();
	return row ?? null;
}

export async function deleteFile(accountId: string, fileId: string) {
	const [row] = await db
		.delete(songFile)
		.where(and(eq(songFile.accountId, accountId), eq(songFile.id, fileId)))
		.returning({ url: songFile.url, thumbnailUrl: songFile.thumbnailUrl });
	if (!row) return false;
	await deleteBlobs([row.url, row.thumbnailUrl ?? ""]);
	return true;
}

/** The file a permanent link names (`/f/<code>`), ready ones only, with the type to serve it as (from its name: the table stores none). */
export async function fileByShareCode(code: string) {
	const row = await db.query.songFile.findFirst({
		where: and(eq(songFile.shareCode, code), eq(songFile.status, "ready")),
		columns: { url: true, filename: true, title: true, kind: true },
	});
	return row ? { ...row, contentType: FILE_CONTENT_TYPE_OF(row.filename) } : null;
}

/**
 * An audio attachment as a demo of its song ("Use as demo"): a new demo row
 * with the file copied under the song's demos in the song's store, ready at
 * once like a recording added to a song (`copyRecordingToSong`); the caller
 * schedules the playback rendition. The attachment stays. Null when the
 * file is not the account's, not ready or not audio; "full" at the demos cap.
 */
export async function createDemoFromFile(accountId: string, userId: string, fileId: string) {
	const f = await db.query.songFile.findFirst({
		where: and(
			eq(songFile.accountId, accountId),
			eq(songFile.id, fileId),
			eq(songFile.status, "ready"),
			eq(songFile.kind, "audio"),
		),
	});
	// A project-level file has no song to be a demo of.
	if (!f?.songId) return null;
	const [{ n }] = await db
		.select({ n: sql<number>`count(*)` })
		.from(demo)
		.where(eq(demo.songId, f.songId));
	if (n >= MAX_DEMOS_PER_SONG) return "full" as const;
	const access = (await accessOfSongId(f.songId)) ?? "public";
	const id = nanoid();
	const pathname = demoPathname(accountId, f.songId, id, f.filename);
	const url = await copyBlob(f.url, pathname, access);
	const [row] = await db
		.insert(demo)
		.values({
			id,
			accountId,
			songId: f.songId,
			label: labelFromFilename(f.filename),
			status: "ready",
			url,
			pathname,
			filename: f.filename,
			contentType: demoContentType(f.filename) ?? FILE_CONTENT_TYPE_OF(f.filename),
			sizeBytes: f.sizeBytes,
			uploadedBy: userId,
		})
		.returning({ id: demo.id });
	return row;
}

/** What a song's documents may mention by `@name` (utils/mentionTargets.ts): its ready attachments and notation files, and its demos. */
export async function songMentionSources(accountId: string, songId: string) {
	const [files, notation, demos] = await Promise.all([
		db.query.songFile.findMany({
			where: and(eq(songFile.accountId, accountId), eq(songFile.songId, songId)),
			columns: { status: true, title: true, filename: true, shareCode: true },
		}),
		db.query.songNotation.findMany({
			where: and(eq(songNotation.accountId, accountId), eq(songNotation.songId, songId)),
			columns: { status: true, title: true, filename: true, shareCode: true },
		}),
		db.query.demo.findMany({
			where: and(eq(demo.accountId, accountId), eq(demo.songId, songId)),
			columns: { id: true, label: true },
		}),
	]);
	return { files, notation, demos };
}

// ---- Notation files attached to songs (docs/uploads-and-blob.md, "Notation files") ----

/** Step 1 of a notation upload: the row in `uploading` state with its pathname and share code; null for a song the account lacks, "full" at the cap. */
export async function createNotation(
	accountId: string,
	userId: string,
	songId: string,
	file: { filename: string; sizeBytes: number; format: NotationFormat },
) {
	const s = await db.query.song.findFirst({
		where: and(eq(song.accountId, accountId), eq(song.id, songId)),
		columns: { id: true },
	});
	if (!s) return null;
	const [{ n }] = await db
		.select({ n: sql<number>`count(*)` })
		.from(songNotation)
		.where(eq(songNotation.songId, songId));
	if (n >= MAX_NOTATION_PER_SONG) return "full" as const;
	const id = nanoid();
	const [row] = await db
		.insert(songNotation)
		.values({
			id,
			accountId,
			songId,
			title: labelFromFilename(file.filename),
			format: file.format,
			url: "",
			pathname: notationPathname(accountId, songId, id, file.filename),
			filename: file.filename,
			contentType: NOTATION_CONTENT_TYPE_OF[file.format],
			sizeBytes: file.sizeBytes,
			shareCode: nanoid(16),
			uploadedBy: userId,
		})
		.returning();
	return row;
}

export function findUploadingNotation(accountId: string, pathname: string) {
	return db.query.songNotation.findFirst({
		where: and(
			eq(songNotation.accountId, accountId),
			eq(songNotation.pathname, pathname),
			eq(songNotation.status, "uploading"),
		),
	});
}

/** Vercel's completion webhook (production only): the URL lands even if the browser's own report never does; the bytes are checked when it does. */
export async function recordNotationUrl(pathname: string, url: string) {
	await db
		.update(songNotation)
		.set({ url })
		.where(and(eq(songNotation.pathname, pathname), eq(songNotation.status, "uploading")));
}

/** Step 3: the file checked, the thumbnail stored, the row ready; the PDF is owed (`pdfStatus` pending), the caller schedules it. */
export async function markNotationReady(
	accountId: string,
	notationId: string,
	data: {
		url: string;
		pageCount: number | null;
		thumbnailUrl: string | null;
		thumbnailPathname: string | null;
	},
) {
	const [row] = await db
		.update(songNotation)
		.set({ ...data, status: "ready", pdfStatus: "pending" })
		.where(and(eq(songNotation.accountId, accountId), eq(songNotation.id, notationId)))
		.returning();
	return row ?? null;
}

/** The upload was not MusicXML (or never finished): the row goes, and whatever landed. */
export async function failNotation(accountId: string, notationId: string) {
	const [row] = await db
		.delete(songNotation)
		.where(and(eq(songNotation.accountId, accountId), eq(songNotation.id, notationId)))
		.returning({
			url: songNotation.url,
			thumbnailUrl: songNotation.thumbnailUrl,
			pdfUrl: songNotation.pdfUrl,
		});
	if (row) await deleteBlobs([row.url, row.thumbnailUrl ?? "", row.pdfUrl ?? ""]);
}

export async function updateNotation(
	accountId: string,
	notationId: string,
	fields: { title: string; description: string },
) {
	const [row] = await db
		.update(songNotation)
		.set(fields)
		.where(and(eq(songNotation.accountId, accountId), eq(songNotation.id, notationId)))
		.returning();
	return row ?? null;
}

/** The file, its thumbnail and its rendered PDF gone from the store and the song. */
export async function deleteNotation(accountId: string, notationId: string) {
	const [row] = await db
		.delete(songNotation)
		.where(and(eq(songNotation.accountId, accountId), eq(songNotation.id, notationId)))
		.returning({
			url: songNotation.url,
			thumbnailUrl: songNotation.thumbnailUrl,
			pdfUrl: songNotation.pdfUrl,
		});
	if (!row) return false;
	await deleteBlobs([row.url, row.thumbnailUrl ?? "", row.pdfUrl ?? ""]);
	return true;
}

/** The notation file a permanent link names (`/f/<code>`), ready ones only, with its PDF when that is ready too. */
export function notationByShareCode(code: string) {
	return db.query.songNotation.findFirst({
		where: and(eq(songNotation.shareCode, code), eq(songNotation.status, "ready")),
		columns: {
			url: true,
			filename: true,
			title: true,
			format: true,
			contentType: true,
			pdfUrl: true,
			pdfStatus: true,
		},
	});
}

/** What the jobs function needs to engrave a notation file's PDF (src/lib/server/notationPdf.ts); by id alone, as a job has no account. */
export function notationForPdf(notationId: string) {
	return db.query.songNotation.findFirst({
		where: eq(songNotation.id, notationId),
		columns: {
			id: true,
			accountId: true,
			songId: true,
			status: true,
			url: true,
			pathname: true,
			filename: true,
			pdfUrl: true,
			pdfStatus: true,
		},
	});
}

/** The rendered PDF's place on the row: where it landed and that it is ready, or that the render failed. */
export async function setNotationPdf(
	notationId: string,
	data: { pdfUrl: string; pdfPathname: string; pdfStatus: "ready" } | { pdfStatus: "failed" },
) {
	await db.update(songNotation).set(data).where(eq(songNotation.id, notationId));
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
export async function createIdea(
	accountId: string,
	userId: string,
	title: string,
	kind: IdeaKind = "idea",
) {
	const [row] = await db
		.insert(idea)
		.values({ accountId, createdBy: userId, title: title.trim() || "Untitled", kind })
		.returning();
	return row;
}

/** A loop exported into the recorder's list (kind "idea"), or hidden again (docs/looper.md, "Save and Export"). */
export async function setIdeaKind(accountId: string, ideaId: string, kind: IdeaKind) {
	const [row] = await db
		.update(idea)
		.set({ kind })
		.where(and(eq(idea.accountId, accountId), eq(idea.id, ideaId)))
		.returning({ id: idea.id });
	return !!row;
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

/** The user's ideas, whichever account they were recorded in (ideas are the user's own), newest first, each with its ready takes in order and URLs the browser may fetch. */
export async function listUserIdeas(userId: string) {
	const rows = await db.query.idea.findMany({
		where: eq(idea.createdBy, userId),
		orderBy: [desc(idea.createdAt)],
		with: {
			takes: {
				where: eq(recording.status, "ready"),
				orderBy: [asc(recording.takeNumber), asc(recording.createdAt)],
				with: {
					stems: {
						where: eq(recordingStem.status, "ready"),
						orderBy: [asc(recordingStem.sortOrder)],
						columns: { id: true, label: true },
					},
				},
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

/**
 * The idea's instrument settings (IdeaInstrumentsDataSchema), stored as
 * JSON, an instrument at a time: a null leaves what the idea holds for
 * that instrument (a take recorded with one instrument's switch off keeps
 * the other's earlier settings). Returns what the idea now holds, or null
 * when there is no such idea.
 */
export async function setIdeaInstruments(
	accountId: string,
	ideaId: string,
	instruments: IdeaInstruments,
): Promise<IdeaInstruments | null> {
	const row = await db.query.idea.findFirst({
		where: and(eq(idea.accountId, accountId), eq(idea.id, ideaId)),
		columns: { instruments: true },
	});
	if (!row) return null;
	const had = parseIdeaInstruments(row.instruments);
	const next: IdeaInstruments = {
		drums: instruments.drums ?? had?.drums ?? null,
		piano: instruments.piano ?? had?.piano ?? null,
		looper: instruments.looper ?? had?.looper ?? null,
		chords: instruments.chords ?? had?.chords ?? null,
	};
	await db
		.update(idea)
		.set({ instruments: JSON.stringify(next) })
		.where(and(eq(idea.accountId, accountId), eq(idea.id, ideaId)));
	return next;
}

/**
 * The user's loops (docs/looper.md, "Export and Load"): the takes whose
 * idea came from the looper (its `instruments.looper` is set), newest
 * first, with how many sources they carry; each export makes an idea of
 * its own, so a loop is one take.
 */
export async function listUserLoops(userId: string) {
	const rows = await db.query.idea.findMany({
		where: and(eq(idea.createdBy, userId), like(idea.instruments, '%"looper":{%')),
		orderBy: [desc(idea.createdAt)],
		with: {
			takes: {
				where: eq(recording.status, "ready"),
				orderBy: [asc(recording.takeNumber)],
				columns: { id: true, createdAt: true },
				with: { stems: { where: eq(recordingStem.status, "ready"), columns: { id: true } } },
			},
		},
	});
	return rows.flatMap((i) => {
		const settings = parseIdeaInstruments(i.instruments)?.looper;
		const take = i.takes[0];
		if (!settings || !take) return [];
		return [
			{
				id: take.id,
				ideaId: i.id,
				kind: i.kind,
				title: i.title,
				createdAt: take.createdAt,
				layers: take.stems.length,
				bpm: settings.bpm,
				bars: settings.bars,
			},
		];
	});
}

/** A take's own file and its sources with URLs the browser may fetch, and the loop's settings when the take came from the looper, for the looper to load or import (the caller checked ownership). */
export async function loopSources(accountId: string, recordingId: string) {
	const rec = await db.query.recording.findFirst({
		where: and(eq(recording.accountId, accountId), eq(recording.id, recordingId)),
		columns: { id: true, url: true, durationSeconds: true, title: true, takeNumber: true },
		with: {
			idea: { columns: { id: true, kind: true, title: true, notes: true, instruments: true } },
			stems: { where: eq(recordingStem.status, "ready"), orderBy: [asc(recordingStem.sortOrder)] },
		},
	});
	if (!rec) return null;
	const settings = parseIdeaInstruments(rec.idea?.instruments ?? null)?.looper ?? null;
	return {
		settings,
		idea: rec.idea
			? { id: rec.idea.id, kind: rec.idea.kind, title: rec.idea.title, notes: rec.idea.notes }
			: null,
		// The take as recorded (the lossless source, which the browser decodes itself), for an import as one layer.
		mix: {
			url: (await presentUrl(rec.url)) ?? rec.url,
			durationSeconds: rec.durationSeconds,
			title: rec.title || `Take ${rec.takeNumber}`,
		},
		sources: await Promise.all(
			rec.stems.map(async (s) => ({
				label: s.label,
				sortOrder: s.sortOrder,
				url: (await presentUrl(s.url)) ?? s.url,
			})),
		),
	};
}

/** The column's JSON as settings; a row from before the column, or one that fails the schema, holds nothing. */
export function parseIdeaInstruments(json: string | null): IdeaInstruments | null {
	if (!json) return null;
	try {
		const r = v.safeParse(IdeaInstrumentsDataSchema, JSON.parse(json));
		return r.success ? r.output : null;
	} catch {
		return null;
	}
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
export async function deleteEmptyIdeas(userId: string, olderThanMs: number) {
	const cutoff = new Date(Date.now() - olderThanMs);
	const rows = await db
		.select({ id: idea.id })
		.from(idea)
		.where(
			and(
				eq(idea.createdBy, userId),
				lt(idea.createdAt, cutoff),
				sql`trim(${idea.notes}) = ''`,
				notExists(
					db.select({ id: recording.id }).from(recording).where(eq(recording.ideaId, idea.id)),
				),
			),
		);
	for (const r of rows) {
		const accountId = await accountOfIdeaRow(r.id);
		if (accountId) await deleteIdea(accountId, r.id);
	}
	return rows.length;
}

/** The account an idea's files are filed under. */
async function accountOfIdeaRow(ideaId: string) {
	const row = await db.query.idea.findFirst({
		where: eq(idea.id, ideaId),
		columns: { accountId: true },
	});
	return row?.accountId ?? null;
}

/** Removes the idea and every take, files included. */
export async function deleteIdea(accountId: string, ideaId: string) {
	const takes = await db
		.select({ url: recording.url, playbackUrl: recording.playbackUrl })
		.from(recording)
		.where(and(eq(recording.accountId, accountId), eq(recording.ideaId, ideaId)));
	const sources = await db
		.select({ url: recordingStem.url })
		.from(recordingStem)
		.innerJoin(recording, eq(recording.id, recordingStem.recordingId))
		.where(and(eq(recording.accountId, accountId), eq(recording.ideaId, ideaId)));
	const row = await db.query.idea.findFirst({
		where: and(eq(idea.accountId, accountId), eq(idea.id, ideaId)),
		columns: { id: true },
	});
	if (!row) return false;
	await deleteIdeaRows([ideaId]);
	await deleteBlobs([
		...takes.flatMap((t) => [t.url, t.playbackUrl ?? ""]),
		...sources.map((x) => x.url),
	]);
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

/** The recording a pathname was reserved for, for the upload handler's ownership check (ideas are the user's own). */
export async function recordingOfPathname(pathname: string) {
	const rec = await db.query.recording.findFirst({
		where: eq(recording.pathname, pathname),
		columns: { id: true, accountId: true },
	});
	if (rec) return rec;
	// A multitrack take's source: the take it belongs to.
	const st = await db.query.recordingStem.findFirst({
		where: eq(recordingStem.pathname, pathname),
		columns: { recordingId: true, accountId: true },
	});
	return st ? { id: st.recordingId, accountId: st.accountId } : null;
}

/** A multitrack take's source reserved under this pathname, for the upload token. */
export function findUploadingRecordingStem(accountId: string, pathname: string) {
	return db.query.recordingStem.findFirst({
		where: and(
			eq(recordingStem.accountId, accountId),
			eq(recordingStem.pathname, pathname),
			eq(recordingStem.status, "uploading"),
		),
	});
}

/** Step 1 of saving a multitrack take's source: the row under its take and the pathname to upload to. */
export async function createRecordingStem(
	accountId: string,
	recordingId: string,
	file: NewStemFile & { label: string; sortOrder: number; codec: string | null },
) {
	const owner = await db.query.recording.findFirst({
		where: and(eq(recording.accountId, accountId), eq(recording.id, recordingId)),
		columns: { id: true },
	});
	if (!owner) return null;
	const id = nanoid();
	const [row] = await db
		.insert(recordingStem)
		.values({
			id,
			accountId,
			recordingId,
			label: file.label,
			sortOrder: file.sortOrder,
			url: "",
			pathname: recordingStemPathname(accountId, recordingId, id, file.filename),
			filename: file.filename,
			contentType: file.contentType,
			sizeBytes: file.sizeBytes,
			codec: file.codec,
		})
		.returning();
	return row;
}

/** Step 3: the browser reports the source's blob URL and the length it timed. */
export async function markRecordingStemReady(
	accountId: string,
	stemId: string,
	url: string,
	durationSeconds: number | null,
) {
	const [row] = await db
		.update(recordingStem)
		.set({ status: "ready", url, durationSeconds })
		.where(and(eq(recordingStem.accountId, accountId), eq(recordingStem.id, stemId)))
		.returning({ id: recordingStem.id, recordingId: recordingStem.recordingId });
	return row ?? null;
}

/** A multitrack take's source by id: its account and its take, for the ready route's ownership check. */
export async function recordingStemById(stemId: string) {
	const row = await db.query.recordingStem.findFirst({
		where: eq(recordingStem.id, stemId),
		columns: { accountId: true, recordingId: true },
	});
	return row ?? null;
}

/**
 * The take's sources onto a song as stems (docs/demo-recording.md,
 * "Multitrack takes"): each file copied under the song, in the song's
 * store, a `stem` row per source with the source's label, ready at once
 * (the player computes peaks it lacks; the jobs function makes the
 * playback renditions). Null without the take or the song; "full" when the
 * song cannot take them all; "none" when the take has no sources.
 */
export async function copyRecordingStemsToSong(
	recordingAccountId: string,
	userId: string,
	recordingId: string,
	songId: string,
) {
	const rec = await db.query.recording.findFirst({
		where: and(eq(recording.accountId, recordingAccountId), eq(recording.id, recordingId)),
		with: {
			stems: { where: eq(recordingStem.status, "ready"), orderBy: [asc(recordingStem.sortOrder)] },
		},
	});
	if (!rec) return null;
	if (rec.stems.length === 0) return "none" as const;
	const s = await db.query.song.findFirst({
		where: eq(song.id, songId),
		columns: { id: true, accountId: true },
		with: { stems: { columns: { sortOrder: true } } },
	});
	if (!s) return null;
	if (s.stems.length + rec.stems.length > MAX_STEMS_PER_SONG) return "full" as const;
	const accountId = s.accountId;
	const access = (await accessOfSongId(songId)) ?? "public";
	let sortOrder = s.stems.reduce((m, x) => Math.max(m, x.sortOrder + 1), 0);
	const ids: string[] = [];
	for (const source of rec.stems) {
		const id = nanoid();
		const pathname = stemPathname(accountId, songId, id, source.filename);
		const url = await copyBlob(source.url, pathname, access);
		await db.insert(stem).values({
			id,
			accountId,
			songId,
			label: source.label,
			sortOrder: sortOrder++,
			status: "ready",
			url,
			pathname,
			filename: source.filename,
			contentType: source.contentType,
			sizeBytes: source.sizeBytes,
			durationSeconds: source.durationSeconds,
			uploadedBy: userId,
		});
		ids.push(id);
	}
	await stemsChanged(songId);
	return ids;
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
	await db
		.update(recordingStem)
		.set({ url, status: "ready" })
		.where(and(eq(recordingStem.pathname, pathname), eq(recordingStem.status, "uploading")));
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
	const sources = await db
		.delete(recordingStem)
		.where(and(eq(recordingStem.accountId, accountId), eq(recordingStem.recordingId, recordingId)))
		.returning({ url: recordingStem.url });
	const [row] = await db
		.delete(recording)
		.where(and(eq(recording.accountId, accountId), eq(recording.id, recordingId)))
		.returning({
			url: recording.url,
			playbackUrl: recording.playbackUrl,
			ideaId: recording.ideaId,
		});
	if (!row) return null;
	await deleteBlobs([row.url, row.playbackUrl ?? "", ...sources.map((x) => x.url)]);
	return { ideaId: row.ideaId };
}

/**
 * Adds a recording to a song as a demo: the file (and its MP3, when
 * rendered) are copied under the song, in the song's store, so the
 * recording stays in the library and the demo lives and dies with the song.
 */
export async function copyRecordingToSong(
	recordingAccountId: string,
	userId: string,
	recordingId: string,
	songId: string,
) {
	const rec = await db.query.recording.findFirst({
		where: and(
			eq(recording.accountId, recordingAccountId),
			eq(recording.id, recordingId),
			eq(recording.status, "ready"),
		),
	});
	if (!rec) return null;
	// The song may belong to another of the user's accounts (ideas are the user's own): the demo is filed under the song's.
	const s = await db.query.song.findFirst({
		where: eq(song.id, songId),
		columns: { id: true, accountId: true },
	});
	if (!s) return null;
	const accountId = s.accountId;
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
	recordingAccountId: string,
	userId: string,
	songId: string,
	recordingId: string,
) {
	const take = await db.query.recording.findFirst({
		where: and(eq(recording.accountId, recordingAccountId), eq(recording.id, recordingId)),
		with: { idea: { columns: { title: true, notes: true } } },
	});
	const notes = take?.idea?.notes.trim() ?? "";
	if (!take?.idea || !notes) return false;
	// The song may be in another of the user's accounts.
	const s = await db.query.song.findFirst({
		where: eq(song.id, songId),
		columns: { accountId: true, notesMarkdown: true },
	});
	if (!s) return false;
	const label = `${take.idea.title} · Take ${take.takeNumber}${take.title ? ` · ${take.title}` : ""}`;
	const merged = s.notesMarkdown.trim()
		? `${s.notesMarkdown.replace(/\s+$/, "")}\n\n## ${label}\n\n${notes}\n`
		: `${notes}\n`;
	const result = await saveSongDoc(s.accountId, userId, songId, "notes", merged);
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
				columns: {
					id: true,
					slug: true,
					name: true,
					isPrivate: true,
					isRestricted: true,
					noAi: true,
				},
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
	await writeDocVersion({
		songId,
		kind,
		userId: null,
		versionNumber,
		markdown: next,
		contentHash,
		createdBy: userId,
	});
	await db
		.update(song)
		.set({ [cols.markdown]: next, [cols.hash]: contentHash, [cols.version]: versionNumber })
		.where(eq(song.id, songId));
	return { ok: true, version: versionNumber, changed: true };
}

/** Which document a song_doc_version row belongs to: a shared kind, or one person's private note. */
function docVersionScope(songId: string, kind: SongDocSaveKind, userId: string | null) {
	return and(
		eq(songDocVersion.songId, songId),
		eq(songDocVersion.kind, kind),
		userId === null ? isNull(songDocVersion.userId) : eq(songDocVersion.userId, userId),
	);
}

/**
 * Writes one revision of a song document (shared, or a private note with its
 * owner's `userId`) and prunes that document to the newest
 * DOC_VERSIONS_TO_KEEP. Best-effort: the current text is already safe on its
 * own row.
 */
async function writeDocVersion(row: {
	songId: string;
	kind: SongDocSaveKind;
	userId: string | null;
	versionNumber: number;
	markdown: string;
	contentHash: string;
	createdBy: string;
}) {
	await db.insert(songDocVersion).values(row);
	const stale = await db
		.select({ id: songDocVersion.id })
		.from(songDocVersion)
		.where(docVersionScope(row.songId, row.kind, row.userId))
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
}

/**
 * A document's revisions, newest first, at most DOC_VERSIONS_TO_KEEP, with
 * who saved each (history.remote.ts). For "mynotes" the caller passes the
 * owner's id and gets only that person's rows; for a shared kind `userId`
 * is null. The markdown comes back raw: the reader renders it.
 */
export async function listDocVersions(
	songId: string,
	kind: SongDocSaveKind,
	userId: string | null,
) {
	const rows = await db.query.songDocVersion.findMany({
		where: docVersionScope(songId, kind, userId),
		orderBy: [desc(songDocVersion.versionNumber)],
		limit: DOC_VERSIONS_TO_KEEP,
		with: { author: { columns: { name: true } } },
	});
	return rows.map((r) => ({
		id: r.id,
		versionNumber: r.versionNumber,
		markdown: r.markdown,
		createdAt: r.createdAt.getTime(),
		createdBy: r.author ? { name: r.author.name } : null,
	}));
}

/** One revision by id, within the same scope as listDocVersions, so another document's row is "not found". */
export async function docVersionById(
	songId: string,
	kind: SongDocSaveKind,
	userId: string | null,
	versionId: string,
) {
	const row = await db.query.songDocVersion.findFirst({
		where: and(docVersionScope(songId, kind, userId), eq(songDocVersion.id, versionId)),
		columns: { id: true, versionNumber: true, markdown: true },
	});
	return row ?? null;
}

// ---- private song notes: one per user and song ---------------------------

/** What the view rules need of a project by id (viewAccess.canViewProject) and its name, unscoped; null when there is none. */
export async function projectViewRow(projectId: string) {
	const row = await db.query.project.findFirst({
		where: and(eq(project.id, projectId), eq(project.status, "active")),
		columns: { id: true, accountId: true, name: true, isPrivate: true, isRestricted: true },
	});
	return row ?? null;
}

/** What the view rules need of a song by id (viewAccess.canViewSong), unscoped; null when there is none. */
export async function songViewRow(songId: string) {
	const row = await db.query.song.findFirst({
		where: eq(song.id, songId),
		columns: { id: true, accountId: true, projectId: true, isPrivate: true },
		with: { project: { columns: { isPrivate: true, isRestricted: true } } },
	});
	return row ?? null;
}

/**
 * The caller's own private note on a song ("mynotes"), or null before the
 * first save. Takes the user id as well as the song: another person's note
 * is never returned, and nothing lists them.
 */
/** Which of these songs the user keeps a private note on (the project page's tiles count it; nothing of the note itself leaves). */
export async function userNoteSongIds(userId: string, songIds: string[]): Promise<Set<string>> {
	if (songIds.length === 0) return new Set();
	const rows = await db
		.select({ songId: songUserNote.songId })
		.from(songUserNote)
		.where(and(eq(songUserNote.userId, userId), inArray(songUserNote.songId, songIds)));
	return new Set(rows.map((r) => r.songId));
}

export async function getUserNote(
	songId: string,
	userId: string,
): Promise<{ markdown: string; html: string; version: number } | null> {
	const row = await db.query.songUserNote.findFirst({
		where: and(eq(songUserNote.songId, songId), eq(songUserNote.userId, userId)),
		columns: { markdown: true, html: true, version: true },
	});
	return row ?? null;
}

/**
 * Saves the caller's private note on a song, creating the row on the first
 * save. Same rules as saveSongDoc: the wipe guard, a no-op save (same text)
 * stays on the current version, a change bumps it and writes a revision
 * (song_doc_version, kind "mynotes", the owner's user id; the newest ten per
 * person and song are kept); the sanitised HTML is stored beside the
 * markdown. With `expectedVersion`, a save over a newer version (another tab
 * of the same person) is refused.
 */
export async function saveUserNote(
	songId: string,
	userId: string,
	accountId: string,
	markdown: string,
	expectedVersion?: number,
	opts: { confirmEmpty?: boolean } = {},
): Promise<SaveDocResult & { html?: string }> {
	const owned = await db.query.song.findFirst({
		where: and(eq(song.accountId, accountId), eq(song.id, songId)),
		columns: { id: true },
	});
	if (!owned) return { ok: false, error: "Song not found." };
	const existing = await db.query.songUserNote.findFirst({
		where: and(eq(songUserNote.songId, songId), eq(songUserNote.userId, userId)),
	});
	const currentText = existing?.markdown ?? "";
	const currentVersion = existing?.version ?? 0;
	if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
		return {
			ok: false,
			error:
				"Your note changed elsewhere (another tab, perhaps). Reload to see the latest and save again.",
		};
	}

	const next = markdown.replace(/\r\n/g, "\n");
	if (
		next.trim() === "" &&
		currentText.trim().length > DOC_WIPE_GUARD_CHARS &&
		!opts.confirmEmpty
	) {
		return {
			ok: false,
			needsConfirm: true,
			error: "This would empty your notes while they have content. Save again to confirm.",
		};
	}
	if (next === currentText) {
		return { ok: true, version: currentVersion, changed: false, html: existing?.html ?? "" };
	}

	const html = renderMarkdown(next);
	const version = currentVersion + 1;
	// One row per song and user (unique index): the first save inserts, the rest update it.
	await db
		.insert(songUserNote)
		.values({ accountId, songId, userId, markdown: next, html, version })
		.onConflictDoUpdate({
			target: [songUserNote.songId, songUserNote.userId],
			set: { markdown: next, html, version },
		});
	// The same history the shared documents keep, scoped to this person (history.remote.ts).
	await writeDocVersion({
		songId,
		kind: MY_NOTES_KIND,
		userId,
		versionNumber: version,
		markdown: next,
		contentHash: await hashMarkdown(next),
		createdBy: userId,
	});
	return { ok: true, version, changed: true, html };
}

// ---- app settings and the home page demo ----------------------------------

/** The song the home page demos, when none is chosen: Kevin's "Eat All the Clocks". */
export const DEFAULT_FEATURED_SONG = {
	account: "mmkk",
	project: "badverbs",
	song: "eat-all-the-clocks",
} as const;

/**
 * Whether sign-up is open or invite-only (docs/auth.md): the `signUpMode`
 * app setting, read on every page load, so it is cached per instance for a
 * moment; unset means open.
 */
let signUpModeCache: { value: SignUpMode; until: number } | null = null;
export async function signUpMode(): Promise<SignUpMode> {
	if (signUpModeCache && signUpModeCache.until > Date.now()) return signUpModeCache.value;
	const value = (await getAppSetting("signUpMode")) === "invite" ? "invite" : "open";
	signUpModeCache = { value, until: Date.now() + 15_000 };
	return value;
}

export async function setSignUpMode(mode: SignUpMode) {
	await setAppSetting("signUpMode", mode);
	signUpModeCache = null;
}

/** The person accepted the plan terms at sign-up (the hook records when). */
export async function recordPlanTermsAccepted(userId: string) {
	await db
		.update(schema.user)
		.set({ planTermsAcceptedAt: new Date() })
		.where(eq(schema.user.id, userId));
}

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

export async function deleteAppSetting(key: string) {
	await db.delete(schema.appSetting).where(eq(schema.appSetting.key, key));
}

/** The beat the home page's drum machine opens with on a first visit (`homeBeat`, set from the demo itself by a system admin); null for the built-in one. A stored project from an older version upgrades through the schema's defaults. */
export async function homeBeat(): Promise<DrumProject | null> {
	const raw = await getAppSetting("homeBeat");
	if (!raw) return null;
	try {
		const parsed = v.safeParse(DrumProjectSchema, JSON.parse(raw));
		return parsed.success ? parsed.output : null;
	} catch {
		return null;
	}
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

// ---- beats (docs/drum-machine.md, Phase 3) ----

/** The account's saved beats, newest first, each with its project and the song it belongs to, if any. */
// ---- custom drum kits (docs/drum-machine.md, "Custom kits") ------------------------------

/** The kit's account (null for a site kit), or null when there is no such kit. */
export async function accountOfDrumKit(kitId: string) {
	const row = await db.query.drumKit.findFirst({
		where: eq(drumKit.id, kitId),
		columns: { id: true, accountId: true },
	});
	return row ? { accountId: row.accountId } : null;
}
export async function accountOfDrumSamplePathname(pathname: string) {
	const row = await db.query.drumSample.findFirst({
		where: eq(drumSample.pathname, pathname),
		columns: { accountId: true },
	});
	return row?.accountId ?? null;
}
const kitScope = (accountId: string | null) =>
	accountId ? eq(drumKit.accountId, accountId) : isNull(drumKit.accountId);

/**
 * The kits a page may play: the site's and then the account's, each
 * voice's ready file with a URL the browser may fetch (presented for the
 * private store). A voice without a ready file is left out: it is silent.
 */
export async function listDrumKitManifests(accountId: string | null): Promise<DrumKitManifest[]> {
	const rows = await db.query.drumKit.findMany({
		where: accountId
			? or(isNull(drumKit.accountId), eq(drumKit.accountId, accountId))
			: isNull(drumKit.accountId),
		orderBy: [asc(drumKit.createdAt)],
		with: {
			samples: {
				where: eq(drumSample.status, "ready"),
				orderBy: [desc(drumSample.createdAt)],
				columns: { voice: true, url: true },
			},
		},
	});
	const out: DrumKitManifest[] = [];
	for (const k of rows) {
		const samples: DrumKitManifest["samples"] = {};
		for (const smp of k.samples) {
			if (samples[smp.voice]) continue; // the newest ready file per voice
			samples[smp.voice] = k.accountId ? ((await presentUrl(smp.url)) ?? smp.url) : smp.url;
		}
		out.push({ id: k.id, name: k.name, scope: k.accountId ? "account" : "site", samples });
	}
	// The site's first, then the account's.
	return out.sort((a, b) => (a.scope === b.scope ? 0 : a.scope === "site" ? -1 : 1));
}

/**
 * A built-in kit's row (the id is the kit's own, "acoustic" or "room"),
 * made the first time a system admin replaces one of its drums: its
 * samples override the static files voice by voice (docs/drum-machine.md,
 * "Custom kits"), and the kit itself is never renamed or deleted.
 */
export async function ensureBuiltinKitRow(id: string) {
	if (!isOverridableKit(id)) return null;
	const existing = await db.query.drumKit.findFirst({
		where: eq(drumKit.id, id),
		columns: { id: true },
	});
	if (existing) return existing;
	const [row] = await db
		.insert(drumKit)
		.values({ id, accountId: null, name: DRUM_KITS.find((k) => k.id === id)?.label ?? id })
		.returning({ id: drumKit.id });
	return row;
}

/** The kits for a manager: every sample row with its state, so an upload under way shows; `accountId` null lists the site's, the two built-ins first (their rows, or empty ones until a drum is replaced). */
export async function listDrumKitsFor(accountId: string | null) {
	const rows = await db.query.drumKit.findMany({
		where: kitScope(accountId),
		orderBy: [asc(drumKit.createdAt)],
		with: {
			samples: {
				where: ne(drumSample.status, "failed"),
				orderBy: [desc(drumSample.createdAt)],
				columns: {
					id: true,
					voice: true,
					status: true,
					filename: true,
					contentType: true,
					sizeBytes: true,
					url: true,
					source: true,
					createdAt: true,
				},
				with: { uploader: { columns: { name: true } } },
			},
		},
	});
	const listed = await Promise.all(
		rows.map(async (k) => ({
			id: k.id,
			name: k.name,
			scope: (k.accountId ? "account" : "site") as "account" | "site",
			builtin: isOverridableKit(k.id),
			samples: await Promise.all(
				k.samples.map(async ({ uploader, ...smp }) => ({
					...smp,
					uploadedBy: uploader?.name ?? null,
					url: smp.url && k.accountId ? ((await presentUrl(smp.url)) ?? smp.url) : smp.url,
				})),
			),
		})),
	);
	if (accountId) return listed;
	const builtins = OVERRIDABLE_KITS.map(
		(id) =>
			listed.find((k) => k.id === id) ?? {
				id,
				name: DRUM_KITS.find((k) => k.id === id)?.label ?? id,
				scope: "site" as const,
				builtin: true,
				samples: [],
			},
	);
	return [...builtins, ...listed.filter((k) => !isOverridableKit(k.id))];
}

export async function createDrumKit(accountId: string | null, userId: string, name: string) {
	if (accountId) {
		const [{ n }] = await db
			.select({ n: sql<number>`count(*)` })
			.from(drumKit)
			.where(eq(drumKit.accountId, accountId));
		if (n >= MAX_DRUM_KITS_PER_ACCOUNT) return "full" as const;
	}
	const [row] = await db
		.insert(drumKit)
		.values({ accountId, createdBy: userId, name: name.trim() })
		.returning();
	return row;
}
export async function renameDrumKit(accountId: string | null, id: string, name: string) {
	if (isOverridableKit(id)) return null;
	const [row] = await db
		.update(drumKit)
		.set({ name: name.trim() })
		.where(and(eq(drumKit.id, id), kitScope(accountId)))
		.returning({ id: drumKit.id, name: drumKit.name });
	return row ?? null;
}
/** The kit, its samples and their files; a built-in's row stays (its drums are removed one by one, back to the static files). */
export async function deleteDrumKit(accountId: string | null, id: string) {
	if (isOverridableKit(id)) return false;
	const kit = await db.query.drumKit.findFirst({
		where: and(eq(drumKit.id, id), kitScope(accountId)),
		columns: { id: true },
		with: { samples: { columns: { url: true } } },
	});
	if (!kit) return false;
	await db.delete(drumSample).where(eq(drumSample.kitId, id));
	await db.delete(drumKit).where(eq(drumKit.id, id));
	await deleteBlobs(kit.samples.map((smp) => smp.url));
	return true;
}
/** Step 1 of a sample upload: the row, reserved; the kit must be the scope's. */
export async function createDrumSample(
	accountId: string | null,
	userId: string,
	kitId: string,
	voice: DrumVoiceId,
	file: NewStemFile,
) {
	const kit = await db.query.drumKit.findFirst({
		where: and(eq(drumKit.id, kitId), kitScope(accountId)),
		columns: { id: true },
	});
	if (!kit) return null;
	const id = nanoid();
	const [row] = await db
		.insert(drumSample)
		.values({
			id,
			kitId,
			accountId,
			voice,
			url: "",
			pathname: drumSamplePathname(accountId, kitId, id, file.filename),
			filename: file.filename,
			contentType: file.contentType,
			sizeBytes: file.sizeBytes,
			uploadedBy: userId,
		})
		.returning();
	return row;
}
export function findUploadingDrumSample(pathname: string) {
	return db.query.drumSample.findFirst({
		where: and(eq(drumSample.pathname, pathname), eq(drumSample.status, "uploading")),
	});
}
export async function drumSampleOwner(id: string) {
	const row = await db.query.drumSample.findFirst({
		where: eq(drumSample.id, id),
		columns: { kitId: true, accountId: true, pathname: true },
	});
	return row ?? null;
}
/** Step 3: the file is up; the voice's earlier files go, so a kit keeps one file per voice. */
export async function markDrumSampleReady(id: string, url: string) {
	const [row] = await db
		.update(drumSample)
		.set({ status: "ready", url })
		.where(eq(drumSample.id, id))
		.returning({ id: drumSample.id, kitId: drumSample.kitId, voice: drumSample.voice });
	if (!row) return null;
	const older = await db
		.delete(drumSample)
		.where(
			and(
				eq(drumSample.kitId, row.kitId),
				eq(drumSample.voice, row.voice),
				ne(drumSample.id, row.id),
			),
		)
		.returning({ url: drumSample.url });
	await deleteBlobs(older.map((o) => o.url));
	return row;
}
/** Production backstop from Vercel's completion webhook. */
export async function recordDrumSampleUrl(pathname: string, url: string) {
	const row = await db.query.drumSample.findFirst({
		where: and(eq(drumSample.pathname, pathname), eq(drumSample.status, "uploading")),
		columns: { id: true },
	});
	if (row) await markDrumSampleReady(row.id, url);
}
/** Where a sample came from, as the uploader or an admin wrote it (provenance). */
export async function setDrumSampleSource(id: string, source: string) {
	const [row] = await db
		.update(drumSample)
		.set({ source })
		.where(eq(drumSample.id, id))
		.returning({ id: drumSample.id, source: drumSample.source });
	return row ?? null;
}
export async function deleteDrumSample(id: string) {
	const [row] = await db
		.delete(drumSample)
		.where(eq(drumSample.id, id))
		.returning({ url: drumSample.url });
	if (!row) return false;
	await deleteBlobs([row.url]);
	return true;
}
/** Every kit of the account with its files, for the account's deletion (src/lib/server/cascade.ts collects the rows; the files go here). */
export async function deleteAccountDrumKits(accountId: string) {
	const samples = await db
		.delete(drumSample)
		.where(eq(drumSample.accountId, accountId))
		.returning({ url: drumSample.url });
	await db.delete(drumKit).where(eq(drumKit.accountId, accountId));
	await deleteBlobs(samples.map((smp) => smp.url));
}

export async function listBeats(accountId: string) {
	return db.query.beat.findMany({
		where: eq(beat.accountId, accountId),
		orderBy: [desc(beat.updatedAt)],
		columns: { id: true, name: true, data: true, songId: true, createdBy: true, updatedAt: true },
		with: { song: { columns: { id: true, title: true } } },
	});
}

/**
 * What the drum machine needs of a song a beat is for (docs/drum-machine.md,
 * Phase 3): its title, its page, and its tempo and meter at the start
 * (the "tempo" and "meter" changes at 0) to seed a new beat. Null when the
 * song is not the account's.
 */
export async function songForBeat(accountId: string, songId: string) {
	const s = await db.query.song.findFirst({
		where: and(eq(song.id, songId), eq(song.accountId, accountId)),
		columns: { id: true, title: true, slug: true, changes: true },
		with: { project: { columns: { slug: true } }, account: { columns: { slug: true } } },
	});
	if (!s) return null;
	const at0 = (kind: string) =>
		s.changes.filter((c) => c.kind === kind).sort((a, b) => a.start - b.start)[0]?.value ?? null;
	const bpm = Number(at0("tempo"));
	return {
		id: s.id,
		title: s.title,
		href: `/${s.account.slug}/projects/${s.project.slug}/${s.slug}`,
		bpm: Number.isFinite(bpm) && bpm > 0 ? Math.round(bpm) : null,
		meter: at0("meter"),
	};
}

export async function createBeat(
	accountId: string,
	userId: string,
	name: string,
	data: DrumProject,
	songId: string | null = null,
) {
	const [row] = await db
		.insert(beat)
		.values({ accountId, createdBy: userId, name: name.trim() || "Untitled beat", data, songId })
		.returning();
	return row!;
}

export async function updateBeat(
	accountId: string,
	id: string,
	patch: { name: string; data: DrumProject },
) {
	const [row] = await db
		.update(beat)
		.set({ name: patch.name.trim() || "Untitled beat", data: patch.data })
		.where(and(eq(beat.id, id), eq(beat.accountId, accountId)))
		.returning();
	return row ?? null;
}

export async function renameBeat(accountId: string, id: string, name: string) {
	const [row] = await db
		.update(beat)
		.set({ name: name.trim() || "Untitled beat" })
		.where(and(eq(beat.id, id), eq(beat.accountId, accountId)))
		.returning();
	return row ?? null;
}

export async function deleteBeat(accountId: string, id: string) {
	await db.delete(beat).where(and(eq(beat.id, id), eq(beat.accountId, accountId)));
}

// ---- chord progressions (docs/chord-player.md, "The progression pad") ----

/** The account's saved progressions, newest first (a kilobyte or so each). */
export async function listProgressions(accountId: string) {
	return db.query.progression.findMany({
		where: eq(progression.accountId, accountId),
		orderBy: [desc(progression.updatedAt)],
		columns: { id: true, name: true, data: true, notes: true, createdBy: true, updatedAt: true },
	});
}

export async function createProgression(
	accountId: string,
	userId: string,
	name: string,
	data: ProgressionData,
	notes = "",
) {
	const [row] = await db
		.insert(progression)
		.values({
			accountId,
			createdBy: userId,
			name: name.trim() || "Untitled progression",
			data,
			notes,
		})
		.returning();
	return row!;
}

export async function updateProgression(
	accountId: string,
	id: string,
	patch: { name: string; data: ProgressionData; notes?: string },
) {
	const [row] = await db
		.update(progression)
		.set({
			name: patch.name.trim() || "Untitled progression",
			data: patch.data,
			...(patch.notes === undefined ? {} : { notes: patch.notes }),
		})
		.where(and(eq(progression.id, id), eq(progression.accountId, accountId)))
		.returning();
	return row ?? null;
}

/** The note board of a progression; true when the row was the account's. */
export async function setProgressionNotes(accountId: string, id: string, notes: string) {
	const [row] = await db
		.update(progression)
		.set({ notes })
		.where(and(eq(progression.id, id), eq(progression.accountId, accountId)))
		.returning({ id: progression.id });
	return !!row;
}

/** Removes a progression left with neither chords nor notes (the notes emptied on a pad never played); true when it went. */
export async function deleteProgressionIfEmpty(accountId: string, id: string) {
	const row = await db.query.progression.findFirst({
		where: and(eq(progression.id, id), eq(progression.accountId, accountId)),
		columns: { data: true, notes: true },
	});
	if (!row || row.data.entries.length > 0 || row.notes.trim()) return false;
	await db.delete(progression).where(eq(progression.id, id));
	return true;
}

export async function renameProgression(accountId: string, id: string, name: string) {
	const [row] = await db
		.update(progression)
		.set({ name: name.trim() || "Untitled progression" })
		.where(and(eq(progression.id, id), eq(progression.accountId, accountId)))
		.returning();
	return row ?? null;
}

export async function deleteProgression(accountId: string, id: string) {
	await db
		.delete(progression)
		.where(and(eq(progression.id, id), eq(progression.accountId, accountId)));
}

// ---- chord styles (docs/chord-player.md, "Styles") ----

export async function listChordStyles(accountId: string) {
	return db.query.chordStyle.findMany({
		where: eq(chordStyle.accountId, accountId),
		orderBy: [desc(chordStyle.updatedAt)],
		columns: { id: true, name: true, data: true, createdBy: true, updatedAt: true },
	});
}

export async function createChordStyle(
	accountId: string,
	userId: string,
	name: string,
	data: ChordStyleData,
) {
	const [row] = await db
		.insert(chordStyle)
		.values({ accountId, createdBy: userId, name: name.trim() || "Untitled style", data })
		.returning();
	return row!;
}

export async function updateChordStyle(
	accountId: string,
	id: string,
	patch: { name: string; data: ChordStyleData },
) {
	const [row] = await db
		.update(chordStyle)
		.set({ name: patch.name.trim() || "Untitled style", data: patch.data })
		.where(and(eq(chordStyle.id, id), eq(chordStyle.accountId, accountId)))
		.returning();
	return row ?? null;
}

export async function renameChordStyle(accountId: string, id: string, name: string) {
	const [row] = await db
		.update(chordStyle)
		.set({ name: name.trim() || "Untitled style" })
		.where(and(eq(chordStyle.id, id), eq(chordStyle.accountId, accountId)))
		.returning();
	return row ?? null;
}

export async function deleteChordStyle(accountId: string, id: string) {
	await db
		.delete(chordStyle)
		.where(and(eq(chordStyle.id, id), eq(chordStyle.accountId, accountId)));
}

// ---- piano presets (docs/piano.md, "Presets") ----

/** The account's piano presets: the slotted ones first by slot, then the rest newest first. */
export async function listPianoPresets(accountId: string) {
	const rows = await db.query.pianoPreset.findMany({
		where: eq(pianoPreset.accountId, accountId),
		orderBy: [desc(pianoPreset.updatedAt)],
		columns: {
			id: true,
			name: true,
			slot: true,
			chordSlot: true,
			data: true,
			createdBy: true,
			updatedAt: true,
		},
	});
	return rows.sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99));
}

/** The slot column an instrument's buttons use on the shared library (docs/piano.md, "Presets"). */
const slotColumn = (instrument: PresetInstrument) =>
	instrument === "chords" ? pianoPreset.chordSlot : pianoPreset.slot;
const slotPatch = (instrument: PresetInstrument, slot: number | null) =>
	instrument === "chords" ? { chordSlot: slot } : { slot };

/** At most one preset of an account on an instrument's slot: the slot comes off whatever held it. */
async function freePianoSlot(
	accountId: string,
	slot: number,
	instrument: PresetInstrument,
	except?: string,
) {
	await db
		.update(pianoPreset)
		.set(slotPatch(instrument, null))
		.where(
			and(
				eq(pianoPreset.accountId, accountId),
				eq(slotColumn(instrument), slot),
				...(except ? [ne(pianoPreset.id, except)] : []),
			),
		);
}

export async function createPianoPreset(
	accountId: string,
	userId: string,
	name: string,
	data: PianoPresetData,
	slot: number | null,
	instrument: PresetInstrument = "piano",
) {
	if (slot) await freePianoSlot(accountId, slot, instrument);
	const [row] = await db
		.insert(pianoPreset)
		.values({
			accountId,
			createdBy: userId,
			name: name.trim() || "Untitled preset",
			data,
			...slotPatch(instrument, slot),
		})
		.returning();
	return row!;
}

export async function updatePianoPreset(
	accountId: string,
	id: string,
	patch: {
		name: string;
		data: PianoPresetData;
		slot?: number | null;
		instrument?: PresetInstrument;
	},
) {
	const instrument = patch.instrument ?? "piano";
	if (patch.slot) await freePianoSlot(accountId, patch.slot, instrument, id);
	const [row] = await db
		.update(pianoPreset)
		.set({
			name: patch.name.trim() || "Untitled preset",
			data: patch.data,
			...(patch.slot === undefined ? {} : slotPatch(instrument, patch.slot)),
		})
		.where(and(eq(pianoPreset.id, id), eq(pianoPreset.accountId, accountId)))
		.returning();
	return row ?? null;
}

export async function renamePianoPreset(accountId: string, id: string, name: string) {
	const [row] = await db
		.update(pianoPreset)
		.set({ name: name.trim() || "Untitled preset" })
		.where(and(eq(pianoPreset.id, id), eq(pianoPreset.accountId, accountId)))
		.returning();
	return row ?? null;
}

export async function setPianoPresetSlot(
	accountId: string,
	id: string,
	slot: number | null,
	instrument: PresetInstrument = "piano",
) {
	if (slot) await freePianoSlot(accountId, slot, instrument, id);
	const [row] = await db
		.update(pianoPreset)
		.set(slotPatch(instrument, slot))
		.where(and(eq(pianoPreset.id, id), eq(pianoPreset.accountId, accountId)))
		.returning();
	return row ?? null;
}

export async function deletePianoPreset(accountId: string, id: string) {
	await db
		.delete(pianoPreset)
		.where(and(eq(pianoPreset.id, id), eq(pianoPreset.accountId, accountId)));
}

export async function countPianoPresets(accountId: string) {
	const [row] = await db
		.select({ n: count() })
		.from(pianoPreset)
		.where(eq(pianoPreset.accountId, accountId));
	return row?.n ?? 0;
}

/** The site's five demo presets (`pianoPresets`, set from the piano by a system admin), a null for an empty slot. */
/** The site's default presets for an instrument's five buttons, an app setting per instrument. */
const siteSettingKey = (instrument: PresetInstrument) =>
	instrument === "chords" ? "chordPresets" : "pianoPresets";
export async function sitePianoPresets(
	instrument: PresetInstrument = "piano",
): Promise<(NamedPianoPreset | null)[]> {
	const raw = await getAppSetting(siteSettingKey(instrument));
	const slots: (NamedPianoPreset | null)[] = Array.from({ length: PIANO_PRESET_SLOTS }, () => null);
	if (!raw) return slots;
	try {
		const json = JSON.parse(raw) as unknown[];
		json.forEach((entry, i) => {
			const parsed = v.safeParse(NamedPianoPresetSchema, entry);
			if (i < PIANO_PRESET_SLOTS && parsed.success) slots[i] = parsed.output;
		});
	} catch {
		// An unreadable setting is an empty rack.
	}
	return slots;
}

export async function setSitePianoPreset(
	slot: number,
	preset: NamedPianoPreset | null,
	instrument: PresetInstrument = "piano",
) {
	const slots = await sitePianoPresets(instrument);
	slots[slot - 1] = preset;
	await setAppSetting(siteSettingKey(instrument), JSON.stringify(slots));
}
