/** What a viewing link opens (src/lib/components/ShareLinks.svelte): a song (on a mix of it), a project, a whole session, one session recording or a set list (its show view). */
export type ShareTarget =
	| { songId: string; mixId?: string }
	| { projectId: string }
	| { sessionId: string }
	| { recordingId: string }
	| { setListId: string };

/** The share form's id fields for a target: its own id set, every other "" (the schema takes exactly one). */
export function shareTargetIds(target: ShareTarget) {
	const ids = {
		songId: "",
		mixId: "",
		projectId: "",
		sessionId: "",
		recordingId: "",
		setListId: "",
	};
	if ("songId" in target) return { ...ids, songId: target.songId, mixId: target.mixId ?? "" };
	if ("projectId" in target) return { ...ids, projectId: target.projectId };
	if ("sessionId" in target) return { ...ids, sessionId: target.sessionId };
	if ("setListId" in target) return { ...ids, setListId: target.setListId };
	return { ...ids, recordingId: target.recordingId };
}
