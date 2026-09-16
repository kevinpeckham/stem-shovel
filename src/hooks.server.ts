import { building } from "$app/environment";
import { auth } from "$lib/auth";
import { db, schema } from "$lib/server/db";
import { withActingMemberships } from "$lib/utils/actingMemberships";
import { ROBOTS_NOINDEX, SECURITY_HEADERS } from "$lib/constants/securityHeaders";
import { resolvePreviewAuth } from "$lib/server/previewAuth";
import type { Handle } from "@sveltejs/kit";
import { svelteKitHandler } from "better-auth/svelte-kit";
import { eq } from "drizzle-orm";

/**
 * Resolves the Better Auth session into `locals.user` (null when signed out)
 * and the user's account memberships. The account a request touches is
 * chosen by the URL (`/[account]/…`) and checked against these memberships
 * by pages, remote functions and API routes (src/lib/server/access.ts).
 * Viewing is public, so an anonymous request still resolves. A request with
 * a valid preview token is the screenshot bot (src/lib/server/previewAuth.ts).
 */
export const handle: Handle = async ({ event, resolve }) => {
	let user = await resolvePreviewAuth(event);
	if (!user) {
		const session = await auth.api.getSession({ headers: event.request.headers });
		const su = session?.user && session.user.isActive !== false ? session.user : null;
		user = su
			? {
					id: su.id,
					name: su.name,
					email: su.email,
					isSystemAdmin: su.isSystemAdmin === true,
					isSuperAdmin: su.isSuperAdmin === true,
				}
			: null;
	}

	event.locals.user = user;
	const real = user
		? (
				await db.query.accountMember.findMany({
					where: eq(schema.accountMember.userId, user.id),
					with: { account: { columns: { slug: true, name: true, status: true } } },
				})
			)
				// A suspended account counts as no membership: its pages, mutations and uploads all close.
				.filter((m) => m.account.status === "active")
				.map((m) => ({
					accountId: m.accountId,
					slug: m.account.slug,
					name: m.account.name,
					role: m.role,
				}))
		: [];
	// A super admin is an acting owner everywhere else (src/lib/utils/actingMemberships.ts).
	event.locals.memberships = user?.isSuperAdmin
		? withActingMemberships(
				real,
				await db.query.account.findMany({
					where: eq(schema.account.status, "active"),
					columns: { id: true, slug: true, name: true },
				}),
			)
		: real;

	const response = await svelteKitHandler({ auth, event, resolve, building });
	// Only the front page is for search engines, and nothing frames or sniffs
	// anything (src/lib/constants/securityHeaders.ts; vercel.json covers static files).
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(name, value);
	if (event.url.pathname !== "/") response.headers.set("x-robots-tag", ROBOTS_NOINDEX);
	return response;
};
