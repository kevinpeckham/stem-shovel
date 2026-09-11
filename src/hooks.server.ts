import { db, schema } from "$lib/server/db";
import type { Handle } from "@sveltejs/kit";
import { eq } from "drizzle-orm";

/**
 * There is no sign-in yet. Every request runs as the seeded owner of the
 * default account (see scripts/seed.ts). When Better Auth arrives this hook
 * resolves the session instead; server code already takes `user` and
 * `account` from `event.locals`, so nothing else changes.
 */
const DEFAULT_ACCOUNT_SLUG = "lightning-jar";

let cached: App.Locals | null = null;

async function defaultPrincipal(): Promise<App.Locals> {
	if (cached) return cached;
	const row = await db.query.account.findFirst({
		where: eq(schema.account.slug, DEFAULT_ACCOUNT_SLUG),
		with: { members: { with: { user: true }, limit: 1 } },
	});
	const member = row?.members[0];
	if (!row || !member) {
		throw new Error(`No seeded account "${DEFAULT_ACCOUNT_SLUG}" — run \`bun run db:seed\``);
	}
	cached = {
		user: { id: member.user.id, name: member.user.name, email: member.user.email },
		account: { id: row.id, name: row.name, slug: row.slug },
	};
	return cached;
}

export const handle: Handle = async ({ event, resolve }) => {
	Object.assign(event.locals, await defaultPrincipal());
	return resolve(event);
};
