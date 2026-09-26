import { accountLimitsOf, accountStorageBytes, memberHeadroom } from "$lib/server/data";
import { db, schema } from "$lib/server/db";
import { sendDigestEmail, sendNotificationEmail } from "$lib/server/email";
import { formatBytes } from "$lib/utils/formatBytes";
import {
	DEFAULT_PREFS,
	digestDue,
	emailDelivery,
	KIND_PRIORITY,
	type NotificationPrefs,
} from "$lib/utils/notificationPolicy";
import type { NotificationKind } from "$lib/val/NotificationSchema";
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
	projectMember,
	project,
	song,
	demo,
	account,
	user: userTable,
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

/** Everyone who may open the project: the account's members (respecting restriction) and the project's own people. */
async function projectAudience(accountId: string, projectId: string): Promise<string[]> {
	const [p, members, people] = await Promise.all([
		db.query.project.findFirst({
			where: eq(project.id, projectId),
			columns: { isRestricted: true },
		}),
		db.query.accountMember.findMany({
			where: eq(accountMember.accountId, accountId),
			columns: { userId: true, role: true },
		}),
		db.query.projectMember.findMany({
			where: eq(projectMember.projectId, projectId),
			columns: { userId: true, role: true },
		}),
	]);
	const ids = new Set<string>();
	for (const m of members) {
		if (m.role === "owner" || m.role === "admin" || !p?.isRestricted) ids.add(m.userId);
	}
	for (const m of people) ids.add(m.userId);
	return [...ids];
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
			await sendNotificationEmail({
				to: person.email,
				name: person.name,
				title: notice.title,
				body: bodyFor(1),
				href: notice.href,
			});
			await db
				.update(notification)
				.set({ emailedAt: new Date() })
				.where(eq(notification.id, row.id));
		} catch (e) {
			console.error("[notifications] email", e);
		}
		if (priority === "high") await deliverSms(prefs, notice.title);
	}
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
	return {
		...s,
		href: `/${s.account.slug}/projects/${s.project.slug}/${s.slug}`,
	};
}
async function nameOf(userId: string) {
	const u = await db.query.user.findFirst({
		where: eq(userTable.id, userId),
		columns: { name: true },
	});
	return u?.name ?? "Someone";
}

/** A comment on a song: everyone on the project but the author. */
export async function notifyComment(accountId: string, songId: string, authorId: string) {
	const s = await songContext(accountId, songId);
	if (!s) return;
	const who = await nameOf(authorId);
	const audience = (await projectAudience(accountId, s.projectId)).filter((id) => id !== authorId);
	await notifyUsers(audience, {
		kind: "comment",
		accountId,
		title: `New comment on ${s.title}`,
		body: (n) =>
			n === 1
				? `${who} commented in ${s.project.name}.`
				: `${n} new comments, the latest from ${who}, in ${s.project.name}.`,
		href: s.href,
		subjectId: songId,
		coalesce: true,
	});
}

/** Stems uploaded to a song: one item per song, folding a batch. */
export async function notifyStems(accountId: string, songId: string, uploaderId: string) {
	const s = await songContext(accountId, songId);
	if (!s) return;
	const who = await nameOf(uploaderId);
	const audience = (await projectAudience(accountId, s.projectId)).filter(
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
	const audience = (await projectAudience(accountId, s.projectId)).filter(
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

/** A song created in a project. */
export async function notifySong(accountId: string, songId: string, creatorId: string) {
	const s = await songContext(accountId, songId);
	if (!s) return;
	const who = await nameOf(creatorId);
	const audience = (await projectAudience(accountId, s.projectId)).filter((id) => id !== creatorId);
	await notifyUsers(audience, {
		kind: "song",
		accountId,
		title: `New song in ${s.project.name}`,
		body: `${who} created "${s.title}".`,
		href: s.href,
		subjectId: songId,
	});
}

/** Someone accepted an invitation: the person who sent it hears. */
export async function notifyInvitationAccepted(
	accepted: {
		invitedBy: string | null;
		account: { id: string; name: string; slug: string };
		project: { name: string; slug: string } | null;
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
			? `/${accepted.account.slug}/projects/${accepted.project.slug}`
			: `/${accepted.account.slug}/settings`,
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
		href: `/${acct.slug}/settings`,
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
		href: `/${acct.slug}/settings`,
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

export async function markAllRead(userId: string) {
	await db
		.update(notification)
		.set({ readAt: new Date() })
		.where(and(eq(notification.userId, userId), isNull(notification.readAt)));
}

// ---- the digest ------------------------------------------------------------

/**
 * Sends each person's daily or weekly summary when it is due: the opt-in
 * items not yet emailed. Called by the cron (vercel.json) once a day;
 * harmless to call more often, since due-ness gates it.
 */
export async function sendDigests(now = new Date()) {
	const rows = await db.query.notificationPreference.findMany({
		where: ne(notificationPreference.digest, "none"),
		with: { user: { columns: { email: true, name: true } } },
	});
	let sent = 0;
	for (const r of rows) {
		if (r.digest === "none" || !digestDue(r.digest, r.digestSentAt, now)) continue;
		const period = r.digest;
		const prefs: NotificationPrefs = r;
		const kinds = (["comment", "stems", "song", "demo"] as const).filter(
			(k) => emailDelivery(k, prefs) === "digest",
		);
		if (kinds.length === 0) continue;
		const items = await db.query.notification.findMany({
			where: and(
				eq(notification.userId, r.userId),
				isNull(notification.emailedAt),
				inArray(notification.kind, kinds),
			),
			orderBy: [desc(notification.updatedAt)],
			limit: 50,
			columns: { id: true, title: true, body: true, href: true },
		});
		if (items.length === 0) continue;
		try {
			await sendDigestEmail({ to: r.user.email, name: r.user.name, period, items });
			await db
				.update(notification)
				.set({ emailedAt: now })
				.where(
					inArray(
						notification.id,
						items.map((i) => i.id),
					),
				);
			await db
				.update(notificationPreference)
				.set({ digestSentAt: now })
				.where(eq(notificationPreference.userId, r.userId));
			sent++;
		} catch (e) {
			console.error("[notifications] digest", e);
		}
	}
	return { sent };
}
