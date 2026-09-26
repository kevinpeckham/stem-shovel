import { requireSignedIn } from "$lib/server/access";
import { listInbox } from "$lib/server/notifications";
import type { PageServerLoad } from "./$types";

/** The signed-in person's inbox, newest first. */
export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireSignedIn(locals, url);
	return { items: await listInbox(user.id) };
};
