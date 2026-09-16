import { listUserDocs } from "$lib/server/data";
import type { PageServerLoad } from "./$types";

/** The documentation index: public; system admins get the editing controls. */
export const load: PageServerLoad = async ({ locals }) => ({
	docs: await listUserDocs(),
	canEdit: !!locals.user?.isSystemAdmin,
});
