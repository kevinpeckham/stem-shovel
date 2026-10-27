import { NOTIFICATION_KIND_LABELS } from "#lib/constants/notificationKindLabels.js";
import type { NotificationKind } from "#lib/val/NotificationSchema.js";

/** "1 comment", "3 comments": a count of notifications of one kind; an unknown kind counts as notifications. */
export function kindLabel(kind: string, n: number): string {
	const labels = NOTIFICATION_KIND_LABELS[kind as NotificationKind] ?? {
		one: "notification",
		many: "notifications",
	};
	return `${n} ${n === 1 ? labels.one : labels.many}`;
}
