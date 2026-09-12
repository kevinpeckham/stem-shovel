import { db, schema } from "$lib/server/db";
import type { Handle } from "@sveltejs/kit";
import { eq } from "drizzle-orm";

/**
 * There is no sign-in yet. Every request runs as the seeded user (see
 * scripts/seed.ts) with their account memberships. The account itself is
 * chosen by the URL — `/[account]/…` — and checked against the memberships
 * in that route's layout and in every remote function / API route. When
 * Better Auth arrives this hook resolves the session instead.
 */
const SEED_EMAIL = "kevin@lightningjar.com";

let cached: App.Locals | null = null;

async function principal(): Promise<App.Locals> {
	if (cached) return cached;
	const user = await db.query.user.findFirst({
		where: eq(schema.user.email, SEED_EMAIL),
		with: { memberships: { with: { account: true } } },
	});
	if (!user) throw new Error(`No seeded user ${SEED_EMAIL} — run \`bun run db:seed\``);
	cached = {
		user: { id: user.id, name: user.name, email: user.email },
		memberships: user.memberships.map((m) => ({
			accountId: m.accountId,
			slug: m.account.slug,
			name: m.account.name,
			role: m.role,
		})),
	};
	return cached;
}

export const handle: Handle = async ({ event, resolve }) => {
	Object.assign(event.locals, await principal());
	return resolve(event);
};
