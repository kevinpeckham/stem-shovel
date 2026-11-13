/** One saved revision of a song's shared document, as the activity feed reads it. */
export interface DocEdit {
	songId: string;
	kind: string;
	createdBy: string | null;
	createdAt: Date;
}

/**
 * A run of saves to one document by one person as a single edit, for the
 * dashboard's Activity: someone working on a chart saves every minute or
 * two, and ten lines of "edited the chart" bury everything else that
 * happened (Kevin, 2026-11-13). Given the revisions newest first, a
 * revision is left out when the same person saved the same document of the
 * same song no more than `gapMs` after it; the gap is measured from one
 * save to the next, so a long sitting is still one edit, and a return after
 * a break is a new one. What is kept is the newest save of each run, so the
 * event carries the time the work stopped.
 */
export function collapseDocEdits<T extends DocEdit>(newestFirst: T[], gapMs: number): T[] {
	/** For each document and person: the time of the oldest save taken into the run in progress. */
	const runs = new Map<string, number>();
	return newestFirst.filter((edit) => {
		const key = `${edit.songId}:${edit.kind}:${edit.createdBy ?? ""}`;
		const at = edit.createdAt.getTime();
		const later = runs.get(key);
		runs.set(key, at);
		return later === undefined || later - at > gapMs;
	});
}
