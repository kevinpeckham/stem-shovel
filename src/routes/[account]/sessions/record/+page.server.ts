import { requireMember, requireSignedIn } from "#lib/server/access.js";
import { listRecordingSessions } from "#lib/server/data.js";
import { SESSION_KIND_LABELS } from "#lib/constants/sessionRecordings.js";
import { dayText, sessionDisplayName } from "#lib/utils/sessionName.js";
import type { PageServerLoad } from "./$types";

/** The session recorder (docs/uploads-and-blob.md, "The session recorder"): members only, with the sessions for its picker. */
export const load: PageServerLoad = async ({ parent, locals, url }) => {
	requireSignedIn(locals, url);
	const { account } = await parent();
	requireMember(locals, account.id);
	const sessions = await listRecordingSessions(account.id);
	return {
		sessions: sessions.slice(0, 40).map((s) => ({
			id: s.id,
			label: sessionDisplayName(s),
			description: `${SESSION_KIND_LABELS[s.kind]} · ${dayText(s.startsOn)}`,
		})),
	};
};
