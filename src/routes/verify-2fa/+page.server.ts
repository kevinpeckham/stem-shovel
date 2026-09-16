import { safeNext } from "$lib/utils/safeNext";
import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** Second step of sign-in for users with two-factor on; already signed in → onward. */
export const load: PageServerLoad = ({ locals, url }) => {
	const next = safeNext(url.searchParams.get("next"));
	if (locals.user) redirect(303, next);
	return { next };
};
