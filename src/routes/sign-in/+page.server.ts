import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals, url }) => {
	const next = url.searchParams.get("next") ?? "/";
	if (locals.user) redirect(303, next.startsWith("/") ? next : "/");
	return { next };
};
