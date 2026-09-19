import { requireSignedIn } from "$lib/server/access";
import { listFeatureRequestsPublic } from "$lib/server/data";
import type { PageServerLoad } from "./$types";

/** Every feature request with its status, priority and the admin's response: for signed-in users (requesters stay unnamed). */
export const load: PageServerLoad = async ({ locals, url }) => {
	requireSignedIn(locals, url);
	return { requests: await listFeatureRequestsPublic() };
};
