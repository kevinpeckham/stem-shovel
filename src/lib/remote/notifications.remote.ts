import { command, form, getRequestEvent } from "$app/server";
import { requireUser } from "$lib/server/access";
import { markAllRead, markRead, savePrefs } from "$lib/server/notifications";
import { NotificationIdSchema, NotificationPreferenceSchema } from "$lib/val/NotificationSchema";
import * as v from "valibot";

/** The inbox and its settings (docs/notifications.md); everything is the caller's own. */
export const markNotificationRead = command(NotificationIdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	await markRead(requireUser(locals).id, id);
	return { read: true };
});

export const markAllNotificationsRead = command(v.object({}), async () => {
	const { locals } = getRequestEvent();
	await markAllRead(requireUser(locals).id);
	return { read: true };
});

export const saveNotificationPreferences = form(NotificationPreferenceSchema, async (prefs) => {
	const { locals } = getRequestEvent();
	await savePrefs(requireUser(locals).id, prefs);
	return { saved: true };
});
