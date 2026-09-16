import { db, schema } from "$lib/server/db";
import { moveBlob, songIdOfPathname } from "$lib/server/blob";
import { accessOfUrl, type BlobAccess } from "$lib/utils/blobAccess";
import { and, eq } from "drizzle-orm";

const { song, stem, demo } = schema;

/** The store a song's files belong in: private when it or its project is. */
function accessOfSong(s: { isPrivate: boolean; project: { isPrivate: boolean } }): BlobAccess {
	return s.isPrivate || s.project.isPrivate ? "private" : "public";
}

export async function accessOfSongId(songId: string): Promise<BlobAccess | null> {
	const row = await db.query.song.findFirst({
		where: eq(song.id, songId),
		columns: { isPrivate: true },
		with: { project: { columns: { isPrivate: true } } },
	});
	return row ? accessOfSong(row) : null;
}

/** The store an upload at this pathname should go to (the song's privacy). */
export async function accessOfPathname(pathname: string): Promise<BlobAccess> {
	const songId = songIdOfPathname(pathname);
	return (songId && (await accessOfSongId(songId))) || "public";
}

/**
 * Moves every file of a song (stems, renditions, MIDI, demos, the mix) into
 * the store its privacy calls for, one file at a time, updating each row as
 * its file lands. Safe to run again: files already in place are skipped.
 * Runs in the background after a privacy change (src/lib/remote/share.remote.ts).
 */
export async function relocateSongFiles(songId: string): Promise<number> {
	const to = await accessOfSongId(songId);
	if (!to) return 0;
	let moved = 0;
	const move = async (url: string | null) => {
		if (!url || accessOfUrl(url) === to) return url;
		moved += 1;
		return moveBlob(url, to);
	};
	const stems = await db.query.stem.findMany({ where: eq(stem.songId, songId) });
	for (const s of stems) {
		const url = s.url ? await move(s.url) : s.url;
		const playbackUrl = await move(s.playbackUrl);
		const midiUrl = await move(s.midiUrl);
		if (url !== s.url || playbackUrl !== s.playbackUrl || midiUrl !== s.midiUrl) {
			await db
				.update(stem)
				.set({ url: url ?? "", playbackUrl, midiUrl })
				.where(eq(stem.id, s.id));
		}
	}
	const demos = await db.query.demo.findMany({ where: eq(demo.songId, songId) });
	for (const d of demos) {
		const url = d.url ? await move(d.url) : d.url;
		const playbackUrl = await move(d.playbackUrl);
		if (url !== d.url || playbackUrl !== d.playbackUrl) {
			await db
				.update(demo)
				.set({ url: url ?? "", playbackUrl })
				.where(eq(demo.id, d.id));
		}
	}
	const s = await db.query.song.findFirst({
		where: eq(song.id, songId),
		columns: { mixUrl: true },
	});
	if (s?.mixUrl) {
		const mixUrl = await move(s.mixUrl);
		if (mixUrl !== s.mixUrl) await db.update(song).set({ mixUrl }).where(eq(song.id, songId));
	}
	return moved;
}

/** Every song of a project, after the project's privacy changed. */
export async function relocateProjectFiles(projectId: string): Promise<number> {
	const songs = await db
		.select({ id: song.id })
		.from(song)
		.where(and(eq(song.projectId, projectId), eq(song.status, "active")));
	let moved = 0;
	for (const s of songs) moved += await relocateSongFiles(s.id);
	return moved;
}
