import { requireUser } from "#lib/server/access.js";
import { listPasskeys } from "#lib/server/data.js";
import type { PageServerLoad } from "./$types";

/** The signed-in user's own security settings (the sign-in email, two-factor, passkeys). */
export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals);
	return {
		email: user.email,
		twoFactorEnabled: user.twoFactorEnabled,
		passkeys: await listPasskeys(user.id),
	};
};
