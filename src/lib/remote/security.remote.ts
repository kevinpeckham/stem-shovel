import { command, getRequestEvent } from "$app/server";
import { requireUser } from "$lib/server/access";
import { background } from "$lib/server/background";
import { sendTwoFactorChangedEmail } from "$lib/server/email";
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
