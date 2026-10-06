import { db, schema } from "$lib/server/db";
import { moveBlob, projectIdOfPathname, songIdOfPathname } from "$lib/server/blob";
import { accessOfUrl, type BlobAccess } from "$lib/utils/blobAccess";
import { and, eq, isNull } from "drizzle-orm";

const { project, song, stem, demo, songFile, songNotation } = schema;

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

/** The store a project's own files belong in (a project-level attachment, its picture): private when the project is. */
async function accessOfProjectId(projectId: string): Promise<BlobAccess | null> {
	const row = await db.query.project.findFirst({
		where: eq(project.id, projectId),
		columns: { isPrivate: true },
	});
	return row ? (row.isPrivate ? "private" : "public") : null;
}

/** The store an upload at this pathname should go to: the song's privacy under `songs/<id>/`, the project's under `projects/<id>/`, public otherwise. */
export async function accessOfPathname(pathname: string): Promise<BlobAccess> {
	const songId = songIdOfPathname(pathname);
	if (songId) return (await accessOfSongId(songId)) ?? "public";
	const projectId = projectIdOfPathname(pathname);
	if (projectId) return (await accessOfProjectId(projectId)) ?? "public";
	return "public";
}

/**
 * Moves every file of a song (stems, renditions, MIDI, demos, attachments and notation files with their thumbnails and rendered PDFs, the mix) into
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
	const files = await db.query.songFile.findMany({ where: eq(songFile.songId, songId) });
	for (const f of files) {
		const url = f.url ? await move(f.url) : f.url;
		const thumbnailUrl = await move(f.thumbnailUrl);
		if (url !== f.url || thumbnailUrl !== f.thumbnailUrl) {
			await db
				.update(songFile)
				.set({ url: url ?? "", thumbnailUrl })
				.where(eq(songFile.id, f.id));
		}
	}
	const notation = await db.query.songNotation.findMany({ where: eq(songNotation.songId, songId) });
	for (const n of notation) {
		const url = n.url ? await move(n.url) : n.url;
		const thumbnailUrl = await move(n.thumbnailUrl);
		const pdfUrl = await move(n.pdfUrl);
		if (url !== n.url || thumbnailUrl !== n.thumbnailUrl || pdfUrl !== n.pdfUrl) {
			await db
				.update(songNotation)
				.set({ url: url ?? "", thumbnailUrl, pdfUrl })
				.where(eq(songNotation.id, n.id));
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

/** Every song of a project and the project's own attachments (songId null), after the project's privacy changed. */
export async function relocateProjectFiles(projectId: string): Promise<number> {
	const songs = await db
		.select({ id: song.id })
		.from(song)
		.where(and(eq(song.projectId, projectId), eq(song.status, "active")));
	let moved = 0;
	for (const s of songs) moved += await relocateSongFiles(s.id);
	const to = await accessOfProjectId(projectId);
	if (!to) return moved;
	const move = async (url: string | null) => {
		if (!url || accessOfUrl(url) === to) return url;
		moved += 1;
		return moveBlob(url, to);
	};
	const files = await db.query.songFile.findMany({
		where: and(eq(songFile.projectId, projectId), isNull(songFile.songId)),
	});
	for (const f of files) {
		const url = f.url ? await move(f.url) : f.url;
		const thumbnailUrl = await move(f.thumbnailUrl);
		if (url !== f.url || thumbnailUrl !== f.thumbnailUrl) {
			await db
				.update(songFile)
				.set({ url: url ?? "", thumbnailUrl })
				.where(eq(songFile.id, f.id));
		}
	}
	return moved;
}
