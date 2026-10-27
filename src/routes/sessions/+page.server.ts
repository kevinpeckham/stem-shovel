import { requireSignedIn } from "#lib/server/access.js";
import { recentRecordingSessions } from "#lib/server/data.js";
import { realMemberships, type Membership } from "#lib/utils/actingMemberships.js";
import { sessionDisplayName } from "#lib/utils/sessionName.js";
import type { PageServerLoad } from "./$types";

/** A cap per account: every session in practice, sorted and filtered in the browser. */
const LIMIT = 500;

/** One account's sessions as rows of the Sessions table (members see all of them). */
async function accountSessions(m: Membership) {
	const rows = await recentRecordingSessions(m.accountId, LIMIT);
	return rows.map((s) => {
		const title = sessionDisplayName(s);
		return {
			id: s.id,
			title,
			href: `/${m.slug}/sessions/s/${s.id}`,
			kind: s.kind,
			place: s.place.trim(),
			startsOn: s.startsOn,
			recordingCount: s.recordingCount,
			account: m.name,
			/** What the search matches besides the name. */
			meta: `${s.place} · ${m.name}`,
		};
	});
}

/** Your Sessions: every recording session in the accounts the person really belongs to, newest day first. */
export const load: PageServerLoad = async ({ locals, url }) => {
	requireSignedIn(locals, url);
	const memberships = realMemberships(locals.memberships);
	const perAccount = await Promise.all(memberships.map(accountSessions));
	return {
		sessions: perAccount.flat().sort((a, b) => b.startsOn.localeCompare(a.startsOn)),
	};
};
