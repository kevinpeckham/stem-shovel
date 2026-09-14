import { invitationByToken } from "$lib/server/data";
import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/**
 * Sign-up is closed: the page needs an invitation (`?invite=<token>`, from
 * the email link) or an invite code (`?code=…` or typed in). The server
 * enforces the same rule when the user is created (src/lib/auth.ts).
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user) redirect(303, "/");
	const token = url.searchParams.get("invite") ?? "";
	const code = url.searchParams.get("code") ?? "";
	if (!token) return { invitation: null, invitationStatus: null, code };
	const found = await invitationByToken(token);
	if (found.status !== "open") return { invitation: null, invitationStatus: found.status, code };
	const inv = found.invitation;
	return {
		invitation: { token, email: inv.email, role: inv.role, account: inv.account.name },
		invitationStatus: null,
		code,
	};
};
