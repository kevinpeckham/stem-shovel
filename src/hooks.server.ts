import { building } from "$app/environment";
import { auth } from "$lib/auth";
import { db, schema } from "$lib/server/db";
import type { Handle } from "@sveltejs/kit";
import { svelteKitHandler } from "better-auth/svelte-kit";
import { eq } from "drizzle-orm";

/**
 * Resolves the Better Auth session into `locals.user` (null when signed out)
 * and the user's account memberships. The account a request touches is
 * chosen by the URL (`/[account]/…`) and checked against these memberships
 * by pages, remote functions and API routes (src/lib/server/access.ts).
 * Viewing is public, so an anonymous request still resolves.
 */
export const handle: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });
	const user = session?.user && session.user.isActive !== false ? session.user : null;

	event.locals.user = user ? { id: user.id, name: user.name, email: user.email } : null;
	event.locals.memberships = user
		? (
				await db.query.accountMember.findMany({
					where: eq(schema.accountMember.userId, user.id),
					with: { account: { columns: { slug: true, name: true } } },
				})
			).map((m) => ({
				accountId: m.accountId,
				slug: m.account.slug,
				name: m.account.name,
				role: m.role,
			}))
		: [];

	return svelteKitHandler({ auth, event, resolve, building });
};
