import { requireUser } from "$lib/server/access";
import { listPasskeys } from "$lib/server/data";
import type { PageServerLoad } from "./$types";

/** The signed-in user's own security settings (two-factor, passkeys). */
export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals);
	return { twoFactorEnabled: user.twoFactorEnabled, passkeys: await listPasskeys(user.id) };
};
