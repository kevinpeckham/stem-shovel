import { form, getRequestEvent } from "$app/server";
import { auth } from "$lib/auth";
import { redirect } from "@sveltejs/kit";

/**
 * Signing out is a POST. It used to be a page whose load ended the session,
 * and with `data-sveltekit-preload-data="hover"` on the body, hovering the
 * nav link was enough to sign the user out.
 */
export const signOut = form(async () => {
	const { request } = getRequestEvent();
	try {
		await auth.api.signOut({ headers: request.headers });
	} catch {
		// No session to end (already signed out elsewhere) — still land on the home page.
	}
	redirect(303, "/");
});
