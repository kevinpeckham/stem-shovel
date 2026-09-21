import { db, schema } from "$lib/server/db";
import { eq, inArray } from "drizzle-orm";

/**
 * The deletes the database does not do for us. The schema declares
 * `onDelete: "cascade"` and `"set null"` on every foreign key, but Turso
 * runs with `PRAGMA foreign_keys = 0`, so deleting a parent row leaves its
 * children behind (an artist's credits crashed the song page that way).
 * Each function here removes a parent's rows and everything under them,
 * deepest first, in the order the schema's graph demands. Blob files are
 * the caller's job (they are collected before the rows go).
 *
 * `scripts/sweep-orphans.ts` finds and removes what earlier deletes left.
 */

const {
	account,
	accountMember,
	aiRequest,
	artist,
	artistMember,
	auditLog,
	authAccount,
	bugReport,
	bugReportVote,
	comment,
	demo,
	idea,
	invitation,
	inviteCode,
	passkey,
	project,
	recording,
	session,
	shareLink,
	song,
	songCredit,
	songDocVersion,
	stem,
	supportRequest,
	twoFactor,
	user,
	userDoc,
	userDocVersion,
} = schema;

/** Songs and everything hanging off them: stems, demos, comments, links, doc versions, credits; AI requests lose their song. */
export async function deleteSongRows(songIds: string[]): Promise<void> {
	if (songIds.length === 0) return;
	await db.delete(songCredit).where(inArray(songCredit.songId, songIds));
	await db.delete(songDocVersion).where(inArray(songDocVersion.songId, songIds));
	await db.delete(comment).where(inArray(comment.songId, songIds));
	await db.delete(shareLink).where(inArray(shareLink.songId, songIds));
	await db.delete(demo).where(inArray(demo.songId, songIds));
	await db.delete(stem).where(inArray(stem.songId, songIds));
	await db.update(aiRequest).set({ songId: null }).where(inArray(aiRequest.songId, songIds));
	await db.delete(song).where(inArray(song.id, songIds));
}

/** Projects with their songs and project-level viewing links. */
export async function deleteProjectRows(projectIds: string[]): Promise<void> {
	if (projectIds.length === 0) return;
	const songs = await db
		.select({ id: song.id })
		.from(song)
		.where(inArray(song.projectId, projectIds));
	await deleteSongRows(songs.map((s) => s.id));
	await db.delete(shareLink).where(inArray(shareLink.projectId, projectIds));
	await db.delete(project).where(inArray(project.id, projectIds));
}

/** Ideas with their takes. */
export async function deleteIdeaRows(ideaIds: string[]): Promise<void> {
	if (ideaIds.length === 0) return;
	await db.delete(recording).where(inArray(recording.ideaId, ideaIds));
	await db.delete(idea).where(inArray(idea.id, ideaIds));
}

/** Artists with their people and every credit naming them. */
export async function deleteArtistRows(artistIds: string[]): Promise<void> {
	if (artistIds.length === 0) return;
	await db.delete(songCredit).where(inArray(songCredit.artistId, artistIds));
	await db.delete(artistMember).where(inArray(artistMember.artistId, artistIds));
	await db.delete(artist).where(inArray(artist.id, artistIds));
}

/** Feature requests and bug reports with their votes. */
export async function deleteBugReportRows(ids: string[]): Promise<void> {
	if (ids.length === 0) return;
	await db.delete(bugReportVote).where(inArray(bugReportVote.reportId, ids));
	await db.delete(bugReport).where(inArray(bugReport.id, ids));
}

/** User docs with their versions. */
export async function deleteUserDocRows(ids: string[]): Promise<void> {
	if (ids.length === 0) return;
	await db.delete(userDocVersion).where(inArray(userDocVersion.docId, ids));
	await db.delete(userDoc).where(inArray(userDoc.id, ids));
}

/** An account and all of its content; audit and support rows keep their text and lose the account. */
export async function deleteAccountRows(accountId: string): Promise<void> {
	const projects = await db
		.select({ id: project.id })
		.from(project)
		.where(eq(project.accountId, accountId));
	await deleteProjectRows(projects.map((p) => p.id));
	const artists = await db
		.select({ id: artist.id })
		.from(artist)
		.where(eq(artist.accountId, accountId));
	await deleteArtistRows(artists.map((a) => a.id));
	const ideas = await db.select({ id: idea.id }).from(idea).where(eq(idea.accountId, accountId));
	await deleteIdeaRows(ideas.map((i) => i.id));
	// Anything filed under the account that missed the tree above (a song without a project, a take without an idea).
	const songs = await db.select({ id: song.id }).from(song).where(eq(song.accountId, accountId));
	await deleteSongRows(songs.map((s) => s.id));
	await db.delete(recording).where(eq(recording.accountId, accountId));
	await db.delete(comment).where(eq(comment.accountId, accountId));
	await db.delete(demo).where(eq(demo.accountId, accountId));
	await db.delete(stem).where(eq(stem.accountId, accountId));
	await db.delete(shareLink).where(eq(shareLink.accountId, accountId));
	await db.delete(invitation).where(eq(invitation.accountId, accountId));
	await db.delete(inviteCode).where(eq(inviteCode.accountId, accountId));
	await db.delete(accountMember).where(eq(accountMember.accountId, accountId));
	await db.update(auditLog).set({ accountId: null }).where(eq(auditLog.accountId, accountId));
	await db
		.update(supportRequest)
		.set({ accountId: null })
		.where(eq(supportRequest.accountId, accountId));
	await db.delete(account).where(eq(account.id, accountId));
}

/** A user: memberships, sign-in records, sessions, two-factor, votes and comments go; what else they made stays without an author. */
export async function deleteUserRows(userId: string): Promise<void> {
	await db.delete(accountMember).where(eq(accountMember.userId, userId));
	await db.delete(authAccount).where(eq(authAccount.userId, userId));
	await db.delete(session).where(eq(session.userId, userId));
	await db.delete(twoFactor).where(eq(twoFactor.userId, userId));
	await db.delete(passkey).where(eq(passkey.userId, userId));
	await db.delete(bugReportVote).where(eq(bugReportVote.userId, userId));
	await db.update(aiRequest).set({ userId: null }).where(eq(aiRequest.userId, userId));
	await db.update(auditLog).set({ userId: null }).where(eq(auditLog.userId, userId));
	await db.update(bugReport).set({ userId: null }).where(eq(bugReport.userId, userId));
	await db.delete(comment).where(eq(comment.userId, userId));
	await db.update(demo).set({ uploadedBy: null }).where(eq(demo.uploadedBy, userId));
	await db.update(idea).set({ createdBy: null }).where(eq(idea.createdBy, userId));
	await db.update(invitation).set({ invitedBy: null }).where(eq(invitation.invitedBy, userId));
	await db.update(inviteCode).set({ createdBy: null }).where(eq(inviteCode.createdBy, userId));
	await db.update(project).set({ createdBy: null }).where(eq(project.createdBy, userId));
	await db.update(recording).set({ recordedBy: null }).where(eq(recording.recordedBy, userId));
	await db.update(shareLink).set({ createdBy: null }).where(eq(shareLink.createdBy, userId));
	await db.update(song).set({ createdBy: null }).where(eq(song.createdBy, userId));
	await db
		.update(songDocVersion)
		.set({ createdBy: null })
		.where(eq(songDocVersion.createdBy, userId));
	await db.update(stem).set({ uploadedBy: null }).where(eq(stem.uploadedBy, userId));
	await db.update(supportRequest).set({ userId: null }).where(eq(supportRequest.userId, userId));
	await db.update(userDoc).set({ updatedBy: null }).where(eq(userDoc.updatedBy, userId));
	await db
		.update(userDocVersion)
		.set({ createdBy: null })
		.where(eq(userDocVersion.createdBy, userId));
	await db.delete(user).where(eq(user.id, userId));
}
