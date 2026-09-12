import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** Old deep links (/projects/x/y) go to the same path under the user's first account. */
export const load: PageServerLoad = ({ locals, params }) => {
	const m = locals.memberships[0];
	if (!m) redirect(303, "/sign-in");
	redirect(307, `/${m.slug}/projects/${params.rest}`);
};
