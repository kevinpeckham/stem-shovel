import { listFeatureRequestsPublic } from "$lib/server/data";
import type { PageServerLoad } from "./$types";

/**
 * Approved feature requests with status, priority, votes and the admin's
 * response, for anyone (requesters stay unnamed); a signed-in requester also
 * sees their own while it waits, and an admin sees everything. Voting and
 * requesting need a sign-in.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user;
	return { requests: await listFeatureRequestsPublic(user?.id ?? null, !!user?.isSystemAdmin) };
};
