import { requireSignedIn } from "#lib/server/access.js";
import { accountsOf } from "#lib/server/data.js";
import type { PageServerLoad } from "./$types";

/** Every account the user belongs to, with a way to leave. */
export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireSignedIn(locals, url);
	return { accounts: await accountsOf(user.id) };
};
