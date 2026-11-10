/**
 * Whose work in an account is a super admin's acting work (src/lib/utils/actingMemberships.ts):
 * the people who are super admins and hold no real membership there. A super admin who
 * really belongs to the account is a member like any other, and their work shows.
 */
export function actingActors(
	people: { id: string; isSuperAdmin: boolean }[],
	memberIds: Iterable<string>,
): Set<string> {
	const members = new Set(memberIds);
	return new Set(people.filter((p) => p.isSuperAdmin && !members.has(p.id)).map((p) => p.id));
}
