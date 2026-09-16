import { requireSystemAdmin } from "$lib/server/access";
import { listBugReports, listInviteCodes, systemOverview } from "$lib/server/data";
import type { PageServerLoad } from "./$types";

/** The operator's page: every account and user, and system invite codes. 404 for anyone else. */
export const load: PageServerLoad = async ({ locals }) => {
	requireSystemAdmin(locals);
	const overview = await systemOverview();
	return {
		...overview,
		inviteCodes: await listInviteCodes(null),
		bugReports: await listBugReports(),
	};
};
