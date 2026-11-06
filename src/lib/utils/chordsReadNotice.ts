/** The admin's notification after posting a batch of chord reads: how many go now, how many wait. */
export function chordsReadNotice(scheduled: number, remaining: number): string {
	if (scheduled === 0) return "Every song is read";
	const songs = `${scheduled} ${scheduled === 1 ? "song" : "songs"}`;
	return remaining > 0 ? `Reading ${songs}, ${remaining} more after these` : `Reading ${songs}`;
}
