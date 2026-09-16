import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** /admin itself opens the first section. */
export const load: PageServerLoad = () => {
	redirect(307, "/admin/accounts");
};
