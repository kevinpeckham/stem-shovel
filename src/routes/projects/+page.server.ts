import { error, redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** Old address; go to the user's first account. */
export const load: PageServerLoad = ({ locals }) => {
	const m = locals.memberships[0];
	if (!m) error(404, "You are not a member of any account");
	redirect(307, `/${m.slug}/projects`);
};
