/**
 * A super admin (user.is_super_admin, set only by `bun run db:super-admin`)
 * counts as an owner of every account they do not belong to. Those extra
 * memberships carry `actingAs: true`: access checks accept them, the header
 * says so, requireMember logs each use, and the account menu, the accounts
 * page and the current-account choice leave them out.
 */
export interface Membership {
	accountId: string;
	slug: string;
	name: string;
	role: string;
	actingAs?: boolean;
}

export function withActingMemberships(
	real: Membership[],
	accounts: { id: string; slug: string; name: string }[],
): Membership[] {
	const own = new Set(real.map((m) => m.accountId));
	return [
		...real,
		...accounts
			.filter((a) => !own.has(a.id))
			.map((a) => ({ accountId: a.id, slug: a.slug, name: a.name, role: "owner", actingAs: true })),
	];
}

/** The memberships a person really holds. */
export const realMemberships = <M extends { actingAs?: boolean }>(ms: M[]) =>
	ms.filter((m) => !m.actingAs);
