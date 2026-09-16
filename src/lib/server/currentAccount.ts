import type { Cookies } from "@sveltejs/kit";

/**
 * Which of a user's accounts is "theirs" right now: the one they last
 * opened (a cookie set by the account layout and the account menu), else
 * the first they own, else the first they belong to. Neutral pages (home,
 * docs, admin, the /projects and /settings shortcuts) use it.
 */
export const CURRENT_ACCOUNT_COOKIE = "current_account";

export interface MembershipLike {
	accountId: string;
	slug: string;
	role: string;
}

export function pickAccount<M extends MembershipLike>(
	memberships: M[],
	preferredSlug: string | null | undefined,
): M | null {
	if (memberships.length === 0) return null;
	return (
		memberships.find((m) => m.slug === preferredSlug) ??
		memberships.find((m) => m.role === "owner") ??
		memberships[0]
	);
}

export function rememberAccount(cookies: Pick<Cookies, "set">, slug: string): void {
	cookies.set(CURRENT_ACCOUNT_COOKIE, slug, {
		path: "/",
		httpOnly: true,
		sameSite: "lax",
		secure: true,
		maxAge: 365 * 24 * 60 * 60,
	});
}
