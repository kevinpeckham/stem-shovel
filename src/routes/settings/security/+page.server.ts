import { requireUser } from "$lib/server/access";
import type { PageServerLoad } from "./$types";

/** The signed-in user's own security settings (two-factor). */
export const load: PageServerLoad = ({ locals }) => {
	const user = requireUser(locals);
	return { twoFactorEnabled: user.twoFactorEnabled };
};
