import { songPicker } from "#lib/server/data.js";

/**
 * Song targets across every account the user edits, for the "add this to
 * a song" pickers of the user's own tools (the Idea Recorder, the Studio):
 * each account's active projects with their active songs, the account's
 * name labelling the project when there is more than one account.
 */
export async function songTargets(editing: { accountId: string; name: string }[]) {
	return (
		await Promise.all(
			editing.map(async (m) =>
				(await songPicker(m.accountId)).map((p) => ({
					...p,
					name: editing.length > 1 ? `${m.name} · ${p.name}` : p.name,
				})),
			),
		)
	).flat();
}
