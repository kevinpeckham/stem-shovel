import * as v from "valibot";
import { NanoIdSchema } from "./NanoIdSchema";

/**
 * What the inbox can hold (docs/notifications.md). "storage-limit" and
 * "seats-full" are high priority: they reach the account's owners and
 * admins by email whatever their settings. The rest go to everyone on the
 * project and reach email only by opt-in, at once or in a digest.
 */
export const NOTIFICATION_KINDS = [
	"storage-limit",
	"seats-full",
	"invitation-accepted",
	"comment",
	"stems",
	"song",
	"demo",
] as const;
export const NotificationKindSchema = v.picklist(NOTIFICATION_KINDS);
export type NotificationKind = v.InferOutput<typeof NotificationKindSchema>;

export const NOTIFICATION_PRIORITIES = ["high", "normal"] as const;
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

/** How the opt-in kinds reach email: at once, or gathered into one message a day or a week. */
export const DIGEST_MODES = ["none", "daily", "weekly"] as const;
export const DigestModeSchema = v.picklist(DIGEST_MODES);
export type DigestMode = v.InferOutput<typeof DigestModeSchema>;

/** The settings form (/settings/notifications); checkboxes arrive as booleans. */
export const NotificationPreferenceSchema = v.object({
	emailComments: v.optional(v.boolean(), false),
	emailStems: v.optional(v.boolean(), false),
	emailSongs: v.optional(v.boolean(), false),
	emailDemos: v.optional(v.boolean(), false),
	digest: v.optional(DigestModeSchema, "none"),
});
export type NotificationPreferenceInput = v.InferOutput<typeof NotificationPreferenceSchema>;

export const NotificationIdSchema = v.object({ id: NanoIdSchema });
