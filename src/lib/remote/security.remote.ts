import { command, getRequestEvent } from "$app/server";
import { requireUser } from "$lib/server/access";
import { background } from "$lib/server/background";
import { sendPasskeyChangedEmail, sendTwoFactorChangedEmail } from "$lib/server/email";
import * as v from "valibot";

/**
 * Two-factor itself is Better Auth's plugin, driven from the browser
 * (authClient.twoFactor.*). This only sends the "it changed" email once the
 * settings page has seen the change succeed; a mail failure never surfaces.
 */
export const notifyTwoFactorChanged = command(
	v.object({ enabled: v.boolean() }),
	async ({ enabled }) => {
		const { locals } = getRequestEvent();
		const user = requireUser(locals);
		background(() => sendTwoFactorChangedEmail(user.email, user.name, enabled));
		return { sent: true };
	},
);

/** The same for a passkey added or removed (the plugin did the work; this is the email). */
export const notifyPasskeyChanged = command(
	v.object({
		added: v.boolean(),
		name: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(80)), ""),
	}),
	async ({ added, name }) => {
		const { locals } = getRequestEvent();
		const user = requireUser(locals);
		background(() => sendPasskeyChangedEmail(user.email, user.name, added, name));
		return { sent: true };
	},
);
