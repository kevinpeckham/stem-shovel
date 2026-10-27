import { requireSignedIn } from "#lib/server/access.js";
import { projectRolesOf, recentSongs } from "#lib/server/data.js";
import { canViewSong, type Viewer } from "#lib/server/viewAccess.js";
import { realMemberships, type Membership } from "#lib/utils/actingMemberships.js";
import { songStage } from "#lib/utils/songStage.js";
import { SONG_STAGES } from "#lib/val/SongStageSchema.js";
import type { PageServerLoad } from "./$types";

/** A cap per account: every song in practice, sorted and filtered in the browser. */
const LIMIT = 500;

/** One account's songs the person may open (the dashboard's rule: active projects, the view rules), as rows of the Songs table. */
async function accountSongs(m: Membership, userId: string) {
	const [rows, projectRoles] = await Promise.all([
		recentSongs(m.accountId, LIMIT),
		projectRolesOf(m.accountId, userId),
	]);
	const who: Viewer = { accountRole: m.role, projectRoles };
	return rows
		.filter((s) => s.project.status === "active" && canViewSong(s, who, []))
		.map((s) => {
			const stage = songStage(s);
			return {
				id: s.id,
				title: s.title,
				href: `/${m.slug}/projects/${s.project.slug}/${s.slug}`,
				project: s.project.name,
				account: m.name,
				stage,
				/** The stage's place in a song's life, so the column sorts writing to finished. */
				stageRank: SONG_STAGES.indexOf(stage),
				updatedAt: s.updatedAt,
				/** What the search matches besides the title. */
				meta: `${s.project.name} · ${m.name}`,
			};
		});
}

/** Your Songs: every song the person may open across the accounts they really belong to, last changed first. */
export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireSignedIn(locals, url);
	const memberships = realMemberships(locals.memberships);
	const perAccount = await Promise.all(memberships.map((m) => accountSongs(m, user.id)));
	return {
		songs: perAccount.flat().sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
	};
};
