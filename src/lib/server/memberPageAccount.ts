import { requireMember, requireSignedIn } from "#lib/server/access.js";

/**
 * The members-only page prologue: a signed-out visitor goes to sign-in and
 * comes back, anyone who is not a member of the account gets a 404, and a
 * member gets the account the `[account]` layout resolved.
 */
export async function memberPageAccount<A extends { id: string }>(event: {
	parent: () => Promise<{ account: A }>;
	locals: App.Locals;
	url: URL;
}): Promise<A> {
	requireSignedIn(event.locals, event.url);
	const { account } = await event.parent();
	requireMember(event.locals, account.id);
	return account;
}
