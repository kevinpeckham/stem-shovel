import type { PageServerLoad } from "./$types";

/** /support is public: a signed-in user gets the short form, a visitor the two-step one. */
export const load: PageServerLoad = ({ locals }) => ({
	signedIn: !!locals.user,
	email: locals.user?.email ?? null,
});
