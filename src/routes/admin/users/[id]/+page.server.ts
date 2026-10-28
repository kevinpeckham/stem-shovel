import { userDetail } from "#lib/server/data.js";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** One user in depth (the layout already requires a system admin); a super admin also gets the link to their dashboard as they see it. */
export const load: PageServerLoad = async ({ params, locals }) => {
	const user = await userDetail(params.id);
	if (!user) error(404, "No such user");
	return { user, canViewAs: locals.user?.isSuperAdmin === true };
};
