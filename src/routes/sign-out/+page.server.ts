import { auth } from "$lib/auth";
import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** Visiting /sign-out ends the session and returns home. */
export const load: PageServerLoad = async ({ request }) => {
	await auth.api.signOut({ headers: request.headers });
	redirect(303, "/");
};
