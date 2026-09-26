import { requireSignedIn } from "$lib/server/access";
import { prefsOf } from "$lib/server/notifications";
import type { PageServerLoad } from "./$types";

/** The signed-in person's notification settings. */
export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireSignedIn(locals, url);
	return { prefs: await prefsOf(user.id) };
};
