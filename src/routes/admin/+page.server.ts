import { requireSystemAdmin } from "$lib/server/access";
import { listAiRequests, listBugReports, listInviteCodes, systemOverview } from "$lib/server/data";
import type { PageServerLoad } from "./$types";

/** The operator's page: every account and user, and system invite codes. 404 for anyone else. */
export const load: PageServerLoad = async ({ locals }) => {
	const admin = requireSystemAdmin(locals);
	const overview = await systemOverview();
	return {
		...overview,
		inviteCodes: await listInviteCodes(null),
		bugReports: await listBugReports(),
		me: admin.id,
		aiRequests: await listAiRequests(),
	};
};
