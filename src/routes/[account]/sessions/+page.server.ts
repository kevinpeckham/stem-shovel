import { requireMember, requireSignedIn } from "#lib/server/access.js";
import {
	listAccountSongs,
	listRecordingSessions,
	listSessionComments,
	sessionChatSummaryOf,
	sessionsWantingPeaks,
} from "#lib/server/data.js";
import { scheduleSessionPeaks } from "#lib/server/jobs.js";
import type { PageServerLoad } from "./$types";

/**
 * The account's sessions (practices and shows) with their recordings:
 * members only, since they are the band's own tapes. With them the
 * review (docs/uploads-and-blob.md, "Sessions" review): every comment on
 * the recordings, and each session's chat at a glance (how many messages,
 * how many unseen, where this person marked it read). A recording whose
 * MP3 was rendered before the review shipped has no waveform yet: the
 * jobs function measures it.
 */
export const load: PageServerLoad = async ({ parent, locals, url }) => {
	const user = requireSignedIn(locals, url);
	const { account } = await parent();
	requireMember(locals, account.id);
	const sessions = await listRecordingSessions(account.id);
	scheduleSessionPeaks(sessionsWantingPeaks(sessions.flatMap((s) => s.recordings)));
	const [comments, chat, songs] = await Promise.all([
		listSessionComments(account.id),
		sessionChatSummaryOf(
			sessions.map((s) => s.id),
			user.id,
		),
		// The account's songs, for the recording's song picker (a recording may be of one song).
		listAccountSongs(account.id, account.slug),
	]);
	return { sessions, comments, chat: Object.fromEntries(chat), songs };
};
