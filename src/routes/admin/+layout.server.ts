import { requireSystemAdmin } from "$lib/server/access";
import type { LayoutServerLoad } from "./$types";

/** The operator's area: every page under /admin is a 404 for anyone else, so it is not advertised. */
export const load: LayoutServerLoad = async ({ locals }) => {
	const admin = requireSystemAdmin(locals);
	return { me: admin.id, superAdmin: admin.isSuperAdmin === true };
};
