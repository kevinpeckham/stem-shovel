import { getRequestEvent } from "$app/server";
import { background } from "$lib/server/background";
import { isRecordingPathname } from "$lib/server/blob";
import { db, schema } from "$lib/server/db";
import { logAudit } from "$lib/server/data";
import { error, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";

/**
 * Tenant checks. The account a request may touch is never taken from the
 * URL alone: pages resolve `[account]` against `locals.memberships`, and
 * mutations look up the entity's account and check membership too, so a
 * forged id from another tenant is "not found".
 */

/** The signed-in user, or 401 (API routes and remote functions). */
export function requireUser(locals: App.Locals) {
	if (!locals.user) error(401, "Sign in first");
	return locals.user;
}

/** Pages that need a member: anonymous visitors go to sign-in and come back. */
export function requireSignedIn(locals: App.Locals, url: URL) {
	if (!locals.user) redirect(303, `/sign-in?next=${encodeURIComponent(url.pathname)}`);
	return locals.user;
}

/** The operator of the app (user.isSystemAdmin); everyone else sees a 404, so /admin is not advertised. */
export function requireSystemAdmin(locals: App.Locals) {
	if (!locals.user?.isSystemAdmin) error(404, "Not found");
	return locals.user;
}

/** A super admin (user.isSuperAdmin): the only one who grants founder status. 404 like the rest. */
export function requireSuperAdmin(locals: App.Locals) {
	if (!locals.user?.isSuperAdmin) error(404, "Not found");
	return locals.user;
}

export function requireMember(locals: App.Locals, accountId: string) {
	const m = locals.memberships.find((m) => m.accountId === accountId);
	if (!m) error(404, "Not found");
	if (m.actingAs && locals.user) auditActing(locals.user.id, accountId);
	return m;
}

/** Whether a membership may change things: every role but viewer. */
export function isEditor(role: string): boolean {
	return role !== "viewer";
}

/**
 * A member who may change things (owner, admin or member): the gate for
 * mutations, uploads and the pages that only exist to edit. A viewer is a
 * member of the account (sees private work, can comment) but gets a 404
 * here like a non-member would.
 */
export function requireEditor(locals: App.Locals, accountId: string) {
	const m = requireMember(locals, accountId);
	if (!isEditor(m.role)) error(404, "Not found");
	return m;
}

/** A super admin used their acting ownership: one line per request, written after the response. */
function auditActing(userId: string, accountId: string) {
	let action = "unknown";
	try {
		const { request } = getRequestEvent();
		action = `${request.method} ${new URL(request.url).pathname}`;
	} catch {
		// outside a request (should not happen); still worth a line
	}
	background(() => logAudit({ userId, accountId, action }));
}

/**
 * Viewing is public: anyone with the URL can open an account's projects and
 * play its songs. Editing (uploading, renaming, deleting, settings) needs
 * membership, which every mutation checks on its own via requireMember /
 * memberOf. Pages use `canEdit` only to show or hide the controls.
 */
export async function publicAccountBySlug(slug: string) {
	const row = await db.query.account.findFirst({
		where: eq(schema.account.slug, slug),
		columns: {
			id: true,
			name: true,
			slug: true,
			status: true,
			plan: true,
			lifetimeFree: true,
			isFounder: true,
			imageUrl: true,
		},
	});
	if (!row) error(404, `No account "${slug}"`);
	return row;
}

export function canEdit(locals: App.Locals, accountId: string): boolean {
	return locals.memberships.some((m) => m.accountId === accountId && isEditor(m.role));
}

/** Any membership, viewers included: the account's private work is theirs to see. */
export function isMember(locals: App.Locals, accountId: string): boolean {
	return locals.memberships.some((m) => m.accountId === accountId);
}

const { project, song, stem, demo, recording, idea, songCredit, artist, artistMember } = schema;

/** Account of an entity by id (unscoped lookup); pair with requireEditor via memberOf. */
export async function accountOfProject(projectId: string) {
	const row = await db.query.project.findFirst({
		where: eq(project.id, projectId),
		columns: { accountId: true },
	});
	return row?.accountId ?? null;
}
export async function accountOfSong(songId: string) {
	const row = await db.query.song.findFirst({
		where: eq(song.id, songId),
		columns: { accountId: true },
	});
	return row?.accountId ?? null;
}
export async function accountOfArtist(artistId: string) {
	const row = await db.query.artist.findFirst({
		where: eq(artist.id, artistId),
		columns: { accountId: true },
	});
	return row?.accountId ?? null;
}
export async function accountOfArtistMember(memberId: string) {
	const row = await db.query.artistMember.findFirst({
		where: eq(artistMember.id, memberId),
		with: { artist: { columns: { accountId: true } } },
	});
	return row?.artist.accountId ?? null;
}
export async function accountOfCredit(creditId: string) {
	const row = await db.query.songCredit.findFirst({
		where: eq(songCredit.id, creditId),
		with: { song: { columns: { accountId: true } } },
	});
	return row?.song.accountId ?? null;
}
export async function accountOfStem(stemId: string) {
	const row = await db.query.stem.findFirst({
		where: eq(stem.id, stemId),
		columns: { accountId: true },
	});
	return row?.accountId ?? null;
}
async function accountOfStemPathname(pathname: string) {
	const row = await db.query.stem.findFirst({
		where: eq(stem.pathname, pathname),
		columns: { accountId: true },
	});
	return row?.accountId ?? null;
}

export async function accountOfDemo(demoId: string) {
	const row = await db.query.demo.findFirst({
		where: eq(demo.id, demoId),
		columns: { accountId: true },
	});
	return row?.accountId ?? null;
}

export async function accountOfIdea(ideaId: string) {
	const row = await db.query.idea.findFirst({
		where: eq(idea.id, ideaId),
		columns: { accountId: true },
	});
	return row?.accountId ?? null;
}

export async function accountOfRecording(recordingId: string) {
	const row = await db.query.recording.findFirst({
		where: eq(recording.id, recordingId),
		columns: { accountId: true },
	});
	return row?.accountId ?? null;
}

/** The account owning whatever reserved this upload pathname: a stem, its MIDI file, a demo or a recording. */
export async function accountOfUploadPathname(pathname: string) {
	const fromStem = await accountOfStemPathname(pathname);
	if (fromStem) return fromStem;
	if (isRecordingPathname(pathname)) {
		const rec = await db.query.recording.findFirst({
			where: eq(recording.pathname, pathname),
			columns: { accountId: true },
		});
		return rec?.accountId ?? null;
	}
	const midi = await db.query.stem.findFirst({
		where: eq(stem.midiPathname, pathname),
		columns: { accountId: true },
	});
	if (midi) return midi.accountId;
	const row = await db.query.demo.findFirst({
		where: eq(demo.pathname, pathname),
		columns: { accountId: true },
	});
	return row?.accountId ?? null;
}

/** Membership for an entity's account, or 404. */
export async function memberOf(
	locals: App.Locals,
	lookup: (id: string) => Promise<string | null>,
	id: string,
	{ viewers = false }: { viewers?: boolean } = {},
) {
	const accountId = await lookup(id);
	if (!accountId) error(404, "Not found");
	return viewers ? requireMember(locals, accountId) : requireEditor(locals, accountId);
}
