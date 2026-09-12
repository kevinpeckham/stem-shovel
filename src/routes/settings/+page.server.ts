import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** Old address; go to the user's first account. */
export const load: PageServerLoad = ({ locals }) => {
	const m = locals.memberships[0];
	if (!m) redirect(303, "/sign-in");
	redirect(307, `/${m.slug}/settings`);
};
