import type { PageServerLoad } from "./$types";

/** Landing page for verification links; the session (if any) is already in locals. */
export const load: PageServerLoad = ({ locals }) => {
	const first = locals.memberships[0];
	return { user: locals.user, home: first ? `/${first.slug}/projects` : "/" };
};
