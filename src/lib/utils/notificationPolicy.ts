import type {
	DigestMode,
	NotificationKind,
	NotificationPriority,
} from "$lib/val/NotificationSchema";

/**
 * Who hears what by email (docs/notifications.md), kept pure so the
 * fan-out, the digest and the tests share one rule.
 */
export interface NotificationPrefs {
	emailComments: boolean;
	emailStems: boolean;
	emailSongs: boolean;
	emailDemos: boolean;
	digest: DigestMode;
}

export const DEFAULT_PREFS: NotificationPrefs = {
	emailComments: false,
	emailStems: false,
	emailSongs: false,
	emailDemos: false,
	digest: "none",
};

export const KIND_PRIORITY: Record<NotificationKind, NotificationPriority> = {
	"storage-limit": "high",
	"seats-full": "high",
	"invitation-accepted": "normal",
	comment: "normal",
	stems: "normal",
	song: "normal",
	demo: "normal",
};

/** The opt-in kinds and the setting that turns each on. */
const OPT_IN: Partial<Record<NotificationKind, keyof NotificationPrefs>> = {
	comment: "emailComments",
	stems: "emailStems",
	song: "emailSongs",
	demo: "emailDemos",
};

/**
 * "now": an email goes out as the notification is made. "digest": it waits
 * for the person's daily or weekly summary. "never": the inbox alone. High
 * priority kinds and an accepted invitation always go now; the rest need
 * the matching opt-in, and go into the digest when one is chosen.
 */
export function emailDelivery(kind: NotificationKind, prefs: NotificationPrefs) {
	const setting = OPT_IN[kind];
	if (!setting) return "now" as const;
	if (!prefs[setting]) return "never" as const;
	return prefs.digest === "none" ? ("now" as const) : ("digest" as const);
}

const HOUR = 60 * 60 * 1000;
/** Whether a person's digest is due: a day (with an hour's slack) or a week since the last. */
export function digestDue(mode: DigestMode, lastSentAt: Date | null, now = new Date()): boolean {
	if (mode === "none") return false;
	if (!lastSentAt) return true;
	const gap = now.getTime() - lastSentAt.getTime();
	return mode === "daily" ? gap >= 23 * HOUR : gap >= 6.5 * 24 * HOUR;
}
