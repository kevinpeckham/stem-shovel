import {
	accountLimitsOf,
	accountStorageBytes,
	memberHeadroom,
	projectAudienceOf,
	studioCommentAudience,
} from "#lib/server/data.js";
import { permalink } from "#lib/utils/permalink.js";
import { isEditor } from "#lib/server/access.js";
import { db, schema } from "#lib/server/db/index.js";
import type { sendNotificationEmail } from "#lib/server/email.js";
import { reportError } from "#lib/server/reportError.js";
import { Mail, markedUntilFailure, runMail } from "#lib/server/effect/mail.js";
import { Db } from "#lib/server/effect/services.js";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import { formatBytes } from "#lib/utils/formatBytes.js";
import { sessionDisplayName } from "#lib/utils/sessionName.js";
import {
	DEFAULT_PREFS,
	digestDue,
	emailDelivery,
	KIND_PRIORITY,
	type NotificationPrefs,
} from "#lib/utils/notificationPolicy.js";
import type { NotificationKind } from "#lib/val/NotificationSchema.js";
import type { ChatScopeKind } from "#lib/val/ChatSchema.js";
import { and, desc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";

/**
 * The inbox (docs/notifications.md): who hears about what, and how. Every
 * event helper here runs after the response (callers wrap it in
 * `background`), writes one row per recipient, and emails the ones whose
 * settings say so; the digest cron sends the rest. Text messages have a
 * hook (`deliverSms`) and no sender yet.
 */
const {
	notification,
	notificationPreference,
	accountMember,
	song,
	demo,
	sessionRecording,
	recordingSession,
	songMix,
	account,
	user: userTable,
	idea,
} = schema;

const COALESCE_MS = 30 * 60 * 1000;
const REPEAT_WARNING_MS = 7 * 24 * 60 * 60 * 1000;
const INBOX_LIMIT = 100;

export interface Prefs extends NotificationPrefs {
	smsNumber: string | null;
	smsEnabled: boolean;
}

export async function prefsOf(userId: string): Promise<Prefs> {
	const row = await db.query.notificationPreference.findFirst({
		where: eq(notificationPreference.userId, userId),
	});
	return row
		? {
				emailComments: row.emailComments,
				emailStems: row.emailStems,
				emailSongs: row.emailSongs,
				emailDemos: row.emailDemos,
				digest: row.digest,
				smsNumber: row.smsNumber,
				smsEnabled: row.smsEnabled,
			}
		: { ...DEFAULT_PREFS, smsNumber: null, smsEnabled: false };
}

export async function savePrefs(userId: string, prefs: NotificationPrefs) {
	await db
		.insert(notificationPreference)
		.values({ userId, ...prefs })
		.onConflictDoUpdate({ target: notificationPreference.userId, set: prefs });
}

// ---- who -------------------------------------------------------------------

/** The account's owners and admins. */
async function accountAdmins(accountId: string): Promise<string[]> {
	const rows = await db.query.accountMember.findMany({
		where: and(
			eq(accountMember.accountId, accountId),
			inArray(accountMember.role, ["owner", "admin"]),
		),
		columns: { userId: true },
	});
	return rows.map((r) => r.userId);
}

// ---- the core --------------------------------------------------------------

interface Notice {
	kind: NotificationKind;
	accountId: string | null;
	title: string;
	/** The inbox line; with `coalesce`, a function of how many times it happened. */
	body: string | ((count: number) => string);
	href: string;
	subjectId?: string | null;
	/** Fold into an unread item about the same subject from the last half hour. */
	coalesce?: boolean;
}

async function notifyUsers(userIds: string[], notice: Notice) {
	const priority = KIND_PRIORITY[notice.kind];
	const bodyFor = (n: number) => (typeof notice.body === "function" ? notice.body(n) : notice.body);
	for (const userId of new Set(userIds)) {
		let row: { id: string; emailedAt: Date | null } | null = null;
		if (notice.coalesce && notice.subjectId) {
			const existing = await db.query.notification.findFirst({
				where: and(
					eq(notification.userId, userId),
					eq(notification.kind, notice.kind),
					eq(notification.subjectId, notice.subjectId),
					isNull(notification.readAt),
					gt(notification.updatedAt, new Date(Date.now() - COALESCE_MS)),
				),
			});
			if (existing) {
				const count = existing.count + 1;
				await db
					.update(notification)
					.set({ count, body: bodyFor(count), title: notice.title })
					.where(eq(notification.id, existing.id));
				row = { id: existing.id, emailedAt: existing.emailedAt };
			}
		}
		if (!row) {
			const [made] = await db
				.insert(notification)
				.values({
					userId,
					accountId: notice.accountId,
					kind: notice.kind,
					priority,
					title: notice.title,
					body: bodyFor(1),
					href: notice.href,
					subjectId: notice.subjectId ?? null,
				})
				.returning({ id: notification.id, emailedAt: notification.emailedAt });
			row = made;
		}
		if (row.emailedAt) continue; // a folded burst was already emailed
		const prefs = await prefsOf(userId);
		if (emailDelivery(notice.kind, prefs) !== "now") continue;
		const person = await db.query.user.findFirst({
			where: eq(userTable.id, userId),
			columns: { email: true, name: true },
		});
		if (!person) continue;
		try {
			await runMail(
				emailOnce(row.id, {
					to: person.email,
					name: person.name,
					title: notice.title,
					body: bodyFor(1),
					href: notice.href,
				}),
			);
		} catch (e) {
			console.error("[notifications] email", e);
			reportError(e, { job: "notification-email" }, { userId, notificationId: row.id });
		}
		if (priority === "high") await deliverSms(prefs, notice.title);
	}
}

/**
 * Emails one inbox item: `emailedAt` is set first (it was null: the caller
 * skips an item already emailed), then the send; a failed or timed-out
 * send sets it back to null, so the item can go in a later email or
 * digest. A mark that fails stops the send (markedUntilFailure).
 */
function emailOnce(id: string, email: Parameters<typeof sendNotificationEmail>[0]) {
	return Effect.gen(function* () {
		const store = yield* Db;
		const mail = yield* Mail;
		yield* markedUntilFailure(
			store.call("markEmailed", async () => {
				await db.update(notification).set({ emailedAt: new Date() }).where(eq(notification.id, id));
			}),
			store.call("unmarkEmailed", async () => {
				await db.update(notification).set({ emailedAt: null }).where(eq(notification.id, id));
			}),
		);
		yield* mail.notification(email);
	}).pipe(Effect.scoped);
}

/**
 * The text-message hook: high-priority items reach here with the person's
 * settings. Nothing sends yet; when a provider is wired in, this is the
 * one place to do it (docs/notifications.md).
 */
async function deliverSms(prefs: Prefs, _text: string): Promise<void> {
	if (!prefs.smsEnabled || !prefs.smsNumber) return;
}

// ---- what happened ---------------------------------------------------------

async function songContext(accountId: string, songId: string) {
	const s = await db.query.song.findFirst({
		where: and(eq(song.accountId, accountId), eq(song.id, songId)),
		columns: { id: true, title: true, slug: true, projectId: true },
		with: {
			project: { columns: { id: true, name: true, slug: true } },
			account: { columns: { slug: true } },
		},
	});
	if (!s) return null;
	// A permanent address (src/lib/utils/permalink.ts): a rename never strands the stored link.
	return { ...s, href: permalink("song", s.id) };
}
async function nameOf(userId: string) {
	const u = await db.query.user.findFirst({
		where: eq(userTable.id, userId),
		columns: { name: true },
	});
	return u?.name ?? "Someone";
}

/** A comment on a song: everyone on the project but the author. */
/** A message in a song's chat (docs/chat.md): everyone on the project but its author; a burst on one song folds into one item. */
export async function notifyChat(
	accountId: string,
	songId: string,
	authorId: string,
	mentioned: string[] = [],
) {
	const s = await songContext(accountId, songId);
	if (!s) return;
	const who = await nameOf(authorId);
	// The people the message mentions hear of it as a mention instead (notifyMention), never twice.
	const audience = (await projectAudienceOf(accountId, s.projectId)).filter(
		(id) => id !== authorId && !mentioned.includes(id),
	);
	await notifyUsers(audience, {
		kind: "chat",
		accountId,
		title: `New message in the chat on ${s.title}`,
		body: (n) =>
			n === 1
				? `${who} wrote in the chat in ${s.project.name}.`
				: `${n} new messages, the latest from ${who}, in ${s.project.name}.`,
		// The permalink's redirect keeps the query (a hash never reaches the server): the page opens the chat panel on it.
		href: `${s.href}?open=chat`,
		subjectId: songId,
		coalesce: true,
	});
}

/** A comment on the song, or (with `mix`) feedback on one of its mixes (docs/mixes.md): the item names the mix and lands on it. */
export async function notifyComment(
	accountId: string,
	songId: string,
	authorId: string,
	mix?: { id: string; version: number; label: string },
	demo?: { id: string; label: string },
) {
	const s = await songContext(accountId, songId);
	if (!s) return;
	const who = await nameOf(authorId);
	const audience = (await projectAudienceOf(accountId, s.projectId)).filter(
		(id) => id !== authorId,
	);
	const on = mix
		? `mix v${mix.version} of ${s.title}`
		: demo
			? `demo "${demo.label}" of ${s.title}`
			: s.title;
	await notifyUsers(audience, {
		kind: "comment",
		accountId,
		title: `New comment on ${on}`,
		body: (n) =>
			n === 1
				? `${who} commented in ${s.project.name}.`
				: `${n} new comments, the latest from ${who}, in ${s.project.name}.`,
		// The permalink's redirect keeps the query: the song page opens its Comments panel, or the demo, on it.
		href: mix
			? `${s.href}/mixes/${mix.id}`
			: demo
				? `${s.href}?demo=${demo.id}`
				: `${s.href}?open=comments`,
		subjectId: mix ? `${songId}:mix:${mix.id}` : demo ? `${songId}:demo:${demo.id}` : songId,
		coalesce: true,
	});
}

/** A mix uploaded to a song (docs/mixes.md): everyone on the project but the uploader; the item lands on the mix. */
export async function notifyMix(accountId: string, mixId: string, uploaderId: string) {
	const m = await db.query.songMix.findFirst({
		where: and(eq(songMix.accountId, accountId), eq(songMix.id, mixId)),
		columns: { songId: true, label: true, version: true },
	});
	if (!m) return;
	const s = await songContext(accountId, m.songId);
	if (!s) return;
	const who = await nameOf(uploaderId);
	const audience = (await projectAudienceOf(accountId, s.projectId)).filter(
		(id) => id !== uploaderId,
	);
	await notifyUsers(audience, {
		kind: "mix",
		accountId,
		title: `New mix of ${s.title}`,
		body: (n) =>
			`${who} uploaded ${n === 1 ? `mix v${m.version} "${m.label}"` : `${n} mixes`} in ${s.project.name}.`,
		href: `${s.href}/mixes/${mixId}`,
		subjectId: m.songId,
		coalesce: true,
	});
}

/** Stems uploaded to a song: one item per song, folding a batch. */
export async function notifyStems(accountId: string, songId: string, uploaderId: string) {
	const s = await songContext(accountId, songId);
	if (!s) return;
	const who = await nameOf(uploaderId);
	const audience = (await projectAudienceOf(accountId, s.projectId)).filter(
		(id) => id !== uploaderId,
	);
	await notifyUsers(audience, {
		kind: "stems",
		accountId,
		title: `New stems on ${s.title}`,
		body: (n) => `${who} uploaded ${n === 1 ? "a stem" : `${n} stems`} in ${s.project.name}.`,
		href: s.href,
		subjectId: songId,
		coalesce: true,
	});
}

/** A demo recording added to a song. */
export async function notifyDemo(accountId: string, demoId: string, uploaderId: string) {
	const d = await db.query.demo.findFirst({
		where: and(eq(demo.accountId, accountId), eq(demo.id, demoId)),
		columns: { songId: true, label: true },
	});
	if (!d) return;
	const s = await songContext(accountId, d.songId);
	if (!s) return;
	const who = await nameOf(uploaderId);
	const audience = (await projectAudienceOf(accountId, s.projectId)).filter(
		(id) => id !== uploaderId,
	);
	await notifyUsers(audience, {
		kind: "demo",
		accountId,
		title: `New demo on ${s.title}`,
		body: (n) =>
			`${who} added ${n === 1 ? `the demo "${d.label}"` : `${n} demos`} in ${s.project.name}.`,
		href: s.href,
		subjectId: d.songId,
		coalesce: true,
	});
}

/** A recording added to a session (docs/uploads-and-blob.md, "Sessions"): every member of the account but the uploader. */
export async function notifySessionRecording(
	accountId: string,
	recordingId: string,
	uploaderId: string,
) {
	const r = await db.query.sessionRecording.findFirst({
		where: and(eq(sessionRecording.accountId, accountId), eq(sessionRecording.id, recordingId)),
		columns: { title: true, filename: true, sessionId: true },
		with: {
			session: { columns: { name: true, place: true, kind: true, startsOn: true } },
			account: { columns: { slug: true } },
		},
	});
	if (!r?.session) return;
	const name = sessionDisplayName(r.session);
	const who = await nameOf(uploaderId);
	const members = await db.query.accountMember.findMany({
		where: eq(accountMember.accountId, accountId),
		columns: { userId: true },
	});
	const audience = members.map((m) => m.userId).filter((id) => id !== uploaderId);
	await notifyUsers(audience, {
		kind: "session",
		accountId,
		title: `New recording in ${name}`,
		body: (n) =>
			`${who} added ${n === 1 ? `"${r.title || r.filename}"` : `${n} recordings`} to ${name}.`,
		href: `/${r.account.slug}/sessions`,
		subjectId: r.sessionId,
		coalesce: true,
	});
}

/** Everyone in the account but one person: the audience of a session's review (docs/uploads-and-blob.md, "Sessions"). */
async function accountAudienceBut(accountId: string, userId: string) {
	const members = await db.query.accountMember.findMany({
		where: eq(accountMember.accountId, accountId),
		columns: { userId: true },
	});
	return members.map((m) => m.userId).filter((id) => id !== userId);
}

/** A comment on a session's recording: every member of the account but the author; the item lands on the recording. */
export async function notifySessionComment(
	accountId: string,
	recordingId: string,
	authorId: string,
) {
	const r = await db.query.sessionRecording.findFirst({
		where: and(eq(sessionRecording.accountId, accountId), eq(sessionRecording.id, recordingId)),
		columns: { title: true, filename: true, sessionId: true },
		with: {
			session: { columns: { name: true, place: true, kind: true, startsOn: true } },
			account: { columns: { slug: true } },
		},
	});
	if (!r?.session) return;
	const name = sessionDisplayName(r.session);
	const who = await nameOf(authorId);
	await notifyUsers(await accountAudienceBut(accountId, authorId), {
		kind: "comment",
		accountId,
		title: `New comment on "${r.title || r.filename}"`,
		body: (n) =>
			n === 1
				? `${who} commented on a recording in ${name}.`
				: `${n} new comments, the latest from ${who}, in ${name}.`,
		href: `/${r.account.slug}/sessions?recording=${recordingId}`,
		subjectId: `session-recording:${recordingId}`,
		coalesce: true,
	});
}

/** A message in a session's chat (docs/chat.md, "Sessions"): every member of the account but the author; the item opens the chat. */
export async function notifySessionChat(
	accountId: string,
	sessionId: string,
	authorId: string,
	mentioned: string[] = [],
) {
	const place = await sessionPlace(accountId, sessionId);
	if (!place) return;
	const { name } = place;
	const who = await nameOf(authorId);
	const audience = (await accountAudienceBut(accountId, authorId)).filter(
		(id) => !mentioned.includes(id),
	);
	await notifyUsers(audience, {
		kind: "chat",
		accountId,
		title: `New message in the chat on ${name}`,
		body: (n) =>
			n === 1
				? `${who} wrote in the chat on ${name}.`
				: `${n} new messages, the latest from ${who}, on ${name}.`,
		href: place.href,
		subjectId: `session:${sessionId}`,
		coalesce: true,
	});
}

/**
 * A mention in a chat (docs/chat.md, "Mentions"): one item for each person
 * named, never folded, landing on the chat like a chat item does. The
 * author is never told of their own mention; the caller passes only the
 * people the message newly names (on an edit, those it did not before).
 */
export async function notifyMention(
	accountId: string,
	scope: ChatScopeKind,
	id: string,
	authorId: string,
	mentionedIds: string[],
) {
	const to = mentionedIds.filter((u) => u !== authorId);
	if (to.length === 0) return;
	const place =
		scope === "session" ? await sessionPlace(accountId, id) : await songPlace(accountId, id);
	if (!place) return;
	const who = await nameOf(authorId);
	await notifyUsers(to, {
		kind: "mention",
		accountId,
		title: `${who} mentioned you in the chat on ${place.name}`,
		body: `${who} mentioned you in the chat on ${place.name}.`,
		href: place.href,
		subjectId: scope === "session" ? `session:${id}` : id,
	});
}

/** A song's chat as a mention names it and links to it. */
async function songPlace(accountId: string, songId: string) {
	const s = await songContext(accountId, songId);
	return s ? { name: s.title, href: `${s.href}?open=chat` } : null;
}

/** A session's chat as a mention names it and links to it. */
async function sessionPlace(accountId: string, sessionId: string) {
	const s = await db.query.recordingSession.findFirst({
		where: and(eq(recordingSession.accountId, accountId), eq(recordingSession.id, sessionId)),
		columns: { name: true, place: true, kind: true, startsOn: true },
		with: { account: { columns: { slug: true } } },
	});
	return s
		? {
				name: sessionDisplayName(s),
				href: `/${s.account.slug}/sessions?session=${sessionId}&open=chat`,
			}
		: null;
}

/** A song created in a project. */
export async function notifySong(accountId: string, songId: string, creatorId: string) {
	const s = await songContext(accountId, songId);
	if (!s) return;
	const who = await nameOf(creatorId);
	const audience = (await projectAudienceOf(accountId, s.projectId)).filter(
		(id) => id !== creatorId,
	);
	await notifyUsers(audience, {
		kind: "song",
		accountId,
		title: `New song in ${s.project.name}`,
		body: `${who} created "${s.title}".`,
		href: s.href,
		subjectId: songId,
	});
}

/** A comment on a Dawn song (D7): its creator and the others who commented, but the author; the item opens the song's Comments panel. */
export async function notifyStudioComment(accountId: string, ideaId: string, authorId: string) {
	const song = await db.query.idea.findFirst({
		where: and(eq(idea.accountId, accountId), eq(idea.id, ideaId)),
		columns: { title: true },
	});
	if (!song) return;
	const who = await nameOf(authorId);
	const audience = (await studioCommentAudience(accountId, ideaId)).filter((id) => id !== authorId);
	await notifyUsers(audience, {
		kind: "comment",
		accountId,
		title: `New comment on ${song.title}`,
		body: (n) =>
			n === 1 ? `${who} commented in Dawn.` : `${n} new comments, the latest from ${who}, in Dawn.`,
		href: `/multitrack-recorder?song=${ideaId}&open=comments`,
		subjectId: `dawn:${ideaId}`,
		coalesce: true,
	});
}

/** A Dawn song shared with the band (D7): every editor of the account but the one sharing. */
export async function notifyStudioShared(accountId: string, ideaId: string, byId: string) {
	const song = await db.query.idea.findFirst({
		where: and(eq(idea.accountId, accountId), eq(idea.id, ideaId)),
		columns: { title: true },
	});
	if (!song) return;
	const who = await nameOf(byId);
	const members = await db.query.accountMember.findMany({
		where: eq(accountMember.accountId, accountId),
		columns: { userId: true, role: true },
	});
	const audience = members
		.filter((m) => m.userId !== byId && isEditor(m.role))
		.map((m) => m.userId);
	await notifyUsers(audience, {
		kind: "song",
		accountId,
		title: `${who} shared "${song.title}" in Dawn`,
		body: "Open it in Dawn to record, edit and mix along.",
		href: `/multitrack-recorder?song=${ideaId}`,
		subjectId: `dawn:${ideaId}`,
	});
}

/** Someone accepted an invitation: the person who sent it hears. */
/** A DAWproject rendered from a Dawn song (docs/dawproject-plan.md, phase 2): the one who asked gets the link, or the reason it failed. */
export async function notifyDawprojectExport(
	userId: string,
	accountId: string,
	outcome: { title: string; href: string } | { title: string; failed: string },
) {
	await notifyUsers([userId], {
		kind: "song",
		accountId,
		title:
			"failed" in outcome
				? `The DAWproject of "${outcome.title}" could not be made`
				: `The DAWproject of "${outcome.title}" is ready`,
		body:
			"failed" in outcome
				? outcome.failed
				: "Open it in Bitwig, Studio One, Cubase or Dawn; the link is its permanent address.",
		href: "failed" in outcome ? "/multitrack-recorder" : outcome.href,
		subjectId: `dawproject:${outcome.title}:${Date.now()}`,
	});
}

export async function notifyInvitationAccepted(
	accepted: {
		invitedBy: string | null;
		account: { id: string; name: string; slug: string };
		project: { id: string; name: string; slug: string } | null;
	},
	accepterId: string,
) {
	if (!accepted.invitedBy || accepted.invitedBy === accepterId) return;
	const who = await nameOf(accepterId);
	const where = accepted.project
		? `${accepted.project.name} (a project of ${accepted.account.name})`
		: accepted.account.name;
	await notifyUsers([accepted.invitedBy], {
		kind: "invitation-accepted",
		accountId: accepted.account.id,
		title: `${who} accepted your invitation`,
		body: `${who} joined ${where}.`,
		href: accepted.project
			? permalink("project", accepted.project.id)
			: permalink("account", accepted.account.id, "settings"),
	});
}

/** Once a warning has gone out for a threshold, it is not repeated for a week. */
async function warnedRecently(accountId: string, kind: NotificationKind, subjectId: string) {
	const row = await db.query.notification.findFirst({
		where: and(
			eq(notification.accountId, accountId),
			eq(notification.kind, kind),
			eq(notification.subjectId, subjectId),
			gt(notification.createdAt, new Date(Date.now() - REPEAT_WARNING_MS)),
		),
		columns: { id: true },
	});
	return !!row;
}

/** After an upload is reserved: warn the account's admins at 80 %, 95 % and 100 % of storage. */
export async function checkStorage(accountId: string) {
	const limits = await accountLimitsOf(accountId);
	if (!limits || limits.storageBytes === null) return;
	const used = await accountStorageBytes(accountId);
	const pct = (100 * used) / limits.storageBytes;
	const threshold = pct >= 100 ? 100 : pct >= 95 ? 95 : pct >= 80 ? 80 : null;
	if (threshold === null || (await warnedRecently(accountId, "storage-limit", String(threshold))))
		return;
	const acct = await db.query.account.findFirst({
		where: eq(account.id, accountId),
		columns: { name: true, slug: true },
	});
	if (!acct) return;
	await notifyUsers(await accountAdmins(accountId), {
		kind: "storage-limit",
		accountId,
		title:
			threshold === 100
				? `${acct.name} is out of storage`
				: `${acct.name} is at ${threshold}% of its storage`,
		body:
			`${formatBytes(used)} of ${formatBytes(limits.storageBytes)} used. ` +
			(threshold === 100
				? "Uploads are refused until files are removed."
				: "Uploads stop at the limit; remove files you no longer need, or ask about more storage."),
		href: permalink("account", accountId, "settings"),
		subjectId: String(threshold),
	});
}

/** After someone joins: tell the account's admins when every seat is taken. */
export async function checkSeats(accountId: string) {
	const room = await memberHeadroom(accountId);
	if (!room.full || room.limit === null) return;
	if (await warnedRecently(accountId, "seats-full", "full")) return;
	const acct = await db.query.account.findFirst({
		where: eq(account.id, accountId),
		columns: { name: true, slug: true },
	});
	if (!acct) return;
	await notifyUsers(await accountAdmins(accountId), {
		kind: "seats-full",
		accountId,
		title: `Every seat on ${acct.name} is taken`,
		body: `${room.members} of ${room.limit} seats are in use. Invitations pause until a member leaves, or ask about more seats.`,
		href: permalink("account", accountId, "settings"),
		subjectId: "full",
	});
}

// ---- the inbox -------------------------------------------------------------

export async function unreadCount(userId: string): Promise<number> {
	const [row] = await db
		.select({ n: sql<number>`count(*)` })
		.from(notification)
		.where(and(eq(notification.userId, userId), isNull(notification.readAt)));
	return Number(row?.n ?? 0);
}

export function listInbox(userId: string) {
	return db.query.notification.findMany({
		where: eq(notification.userId, userId),
		orderBy: [desc(notification.updatedAt)],
		limit: INBOX_LIMIT,
		columns: {
			id: true,
			kind: true,
			priority: true,
			title: true,
			body: true,
			href: true,
			count: true,
			readAt: true,
			updatedAt: true,
		},
	});
}

export async function markRead(userId: string, id: string) {
	await db
		.update(notification)
		.set({ readAt: new Date() })
		.where(
			and(eq(notification.userId, userId), eq(notification.id, id), isNull(notification.readAt)),
		);
}

/**
 * The person has seen a subject itself (a chat they opened, say), so its
 * unread notifications of those kinds are read too; the dashboard's Latest
 * and Conversations then agree. Returns how many it marked.
 */
export async function markSubjectRead(
	userId: string,
	kinds: NotificationKind[],
	subjectId: string,
): Promise<number> {
	const rows = await db
		.update(notification)
		.set({ readAt: new Date() })
		.where(
			and(
				eq(notification.userId, userId),
				inArray(notification.kind, kinds),
				eq(notification.subjectId, subjectId),
				isNull(notification.readAt),
			),
		)
		.returning({ id: notification.id });
	return rows.length;
}

export async function markAllRead(userId: string) {
	await db
		.update(notification)
		.set({ readAt: new Date() })
		.where(and(eq(notification.userId, userId), isNull(notification.readAt)));
}

// ---- the digest ------------------------------------------------------------

/**
 * The digest run's limits: the cron function has 300 s (`maxDuration` in
 * src/routes/api/notifications/digest/+server.ts), so the run stops
 * starting people after `budget` and leaves the rest to the next call, and
 * one person's work (the query, the marks, the send) gets `perUser`.
 * A test shortens them with `Effect.provideService(DigestTuning, …)`.
 */
export const DigestTuning = Context.Reference<{
	readonly budget: Duration.Input;
	readonly perUser: Duration.Input;
}>("DigestTuning", {
	defaultValue: () => ({ budget: "240 seconds", perUser: "30 seconds" }),
});

const DIGEST_KINDS = ["comment", "stems", "song", "demo", "mix", "session"] as const;

type DigestRow = Awaited<ReturnType<typeof digestPeople>>[number];

function digestPeople() {
	return db.query.notificationPreference.findMany({
		where: ne(notificationPreference.digest, "none"),
		with: { user: { columns: { email: true, name: true } } },
	});
}

/**
 * Sends each person's daily or weekly summary when it is due: the opt-in
 * items not yet emailed nor read in the app. Called by the cron (vercel.json) once a day;
 * harmless to call more often, since due-ness gates it. People go one at
 * a time, each under DigestTuning.perUser; a person's failure is logged
 * and reported and the run goes on; past DigestTuning.budget the run
 * stops starting people and returns, the rest due on the next call.
 */
export function sendDigests(now = new Date()) {
	return runMail(digests(now));
}

/** `sendDigests` as an effect, for a test that shortens DigestTuning. */
export function digests(now: Date) {
	return Effect.gen(function* () {
		const { budget, perUser } = yield* DigestTuning;
		const started = yield* Clock.currentTimeMillis;
		const store = yield* Db;
		const rows = yield* store.call("digestPeople", digestPeople);
		let sent = 0;
		for (const [i, r] of rows.entries()) {
			if ((yield* Clock.currentTimeMillis) - started > Duration.toMillis(budget)) {
				console.warn(
					`[digest] time budget spent; ${rows.length - i} of ${rows.length} people left for the next run`,
				);
				break;
			}
			const went = yield* digestFor(r, now).pipe(
				Effect.timeout(perUser),
				Effect.catch((e) =>
					Effect.sync(() => {
						console.error("[digest]", r.userId, e);
						reportError(e, { job: "digest" }, { userId: r.userId });
						return false;
					}),
				),
			);
			if (went) sent++;
		}
		return { sent };
	});
}

/**
 * One person's digest, when due and with something in it. Mark first:
 * the items' `emailedAt` (null before: the query asks for that) and the
 * person's `digestSentAt` are set to `now`, then the send; a failed or
 * interrupted send puts the items back to null and `digestSentAt` back to
 * its previous value, so the next run tries again (markedUntilFailure has
 * the trade-off). True when a digest went.
 */
function digestFor(r: DigestRow, now: Date) {
	return Effect.gen(function* () {
		if (r.digest === "none" || !digestDue(r.digest, r.digestSentAt, now)) return false;
		const period = r.digest;
		const prefs: NotificationPrefs = r;
		const kinds = DIGEST_KINDS.filter((k) => emailDelivery(k, prefs) === "digest");
		if (kinds.length === 0) return false;
		const store = yield* Db;
		const mail = yield* Mail;
		const items = yield* store.call("digestItems", () =>
			db.query.notification.findMany({
				where: and(
					eq(notification.userId, r.userId),
					isNull(notification.emailedAt),
					// Read in the app already: nothing to tell (Kevin, 2026-10-08).
					isNull(notification.readAt),
					inArray(notification.kind, kinds),
				),
				orderBy: [desc(notification.updatedAt)],
				limit: 50,
				columns: { id: true, title: true, body: true, href: true },
			}),
		);
		if (items.length === 0) return false;
		const ids = items.map((i) => i.id);
		const stampItems = (emailedAt: Date | null) =>
			store.call("stampDigestItems", async () => {
				await db.update(notification).set({ emailedAt }).where(inArray(notification.id, ids));
			});
		const stampPerson = (digestSentAt: Date | null) =>
			store.call("stampDigestSent", async () => {
				await db
					.update(notificationPreference)
					.set({ digestSentAt })
					.where(eq(notificationPreference.userId, r.userId));
			});
		yield* markedUntilFailure(stampItems(now), stampItems(null));
		yield* markedUntilFailure(stampPerson(now), stampPerson(r.digestSentAt));
		yield* mail.digest({ to: r.user.email, name: r.user.name, period, items });
		return true;
	}).pipe(Effect.scoped);
}
