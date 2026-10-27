import type { NotificationKind } from "../val/NotificationSchema";

/** What one and several notifications of a kind are called on the dashboard's digest line ("3 comments · 1 session"). */
export const NOTIFICATION_KIND_LABELS: Record<NotificationKind, { one: string; many: string }> = {
	"storage-limit": { one: "storage warning", many: "storage warnings" },
	"seats-full": { one: "seats warning", many: "seats warnings" },
	"invitation-accepted": { one: "new member", many: "new members" },
	comment: { one: "comment", many: "comments" },
	chat: { one: "chat message", many: "chat messages" },
	mention: { one: "mention", many: "mentions" },
	stems: { one: "stem upload", many: "stem uploads" },
	song: { one: "new song", many: "new songs" },
	demo: { one: "demo", many: "demos" },
	mix: { one: "mix", many: "mixes" },
	session: { one: "session", many: "sessions" },
};
