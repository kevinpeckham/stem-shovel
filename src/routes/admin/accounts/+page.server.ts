import { systemOverview } from "#lib/server/data.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	// The Dashboard link goes only where the admin holds a membership, real or acting (a super admin's).
	const held = new Set(locals.memberships.map((m) => m.accountId));
	return {
		accounts: (await systemOverview()).accounts.map((a) => ({
			...a,
			canViewDashboard: held.has(a.id),
		})),
	};
};
