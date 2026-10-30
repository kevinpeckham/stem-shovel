/** One file in the media cache's index (workers/mediaCache.worker.ts): its size, when it was last used, and the song it belongs to. */
export interface MediaCacheEntry {
	bytes: number;
	used: number;
	song: string;
}

/**
 * The keys the media cache drops so it fits `budget` after a write for
 * `keepSong` (workers/mediaCache.worker.ts): whole songs, the least
 * recently used first (a song's last use is its newest file's), never the
 * song being written; and if that song alone is still over the budget, its
 * own files too, since a song kept in part does not play without a
 * connection anyway.
 */
export function mediaCacheEvictions(
	index: Record<string, MediaCacheEntry>,
	keepSong: string,
	budget: number,
): string[] {
	const songs = new Map<string, { bytes: number; used: number; keys: string[] }>();
	let total = 0;
	for (const [key, e] of Object.entries(index)) {
		const s = songs.get(e.song) ?? { bytes: 0, used: 0, keys: [] };
		s.bytes += e.bytes;
		s.used = Math.max(s.used, e.used);
		s.keys.push(key);
		songs.set(e.song, s);
		total += e.bytes;
	}
	const out: string[] = [];
	const oldest = [...songs.entries()]
		.filter(([song]) => song !== keepSong)
		.sort((a, b) => a[1].used - b[1].used);
	for (const [, s] of oldest) {
		if (total <= budget) break;
		total -= s.bytes;
		out.push(...s.keys);
	}
	if (total > budget) out.push(...(songs.get(keepSong)?.keys ?? []));
	return out;
}
