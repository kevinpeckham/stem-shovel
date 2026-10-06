import { deleteBlobs } from "$lib/server/blob";
import { deleteProjectRows } from "$lib/server/cascade";
import { db, schema } from "$lib/server/db";
import type { ArchiveStatus } from "$lib/val/ArchiveStatusSchema";
import { and, asc, eq, inArray } from "drizzle-orm";

const { project, song, stem, demo, songFile, songNotation } = schema;

/**
 * Archiving and deleting projects (src/lib/remote/projects.remote.ts). Any
 * member archives or restores: an archived project leaves the projects
 * list for an "Archived" section and keeps its songs and files. Only an
 * owner or admin deletes, and only an archived project (archiving first is
 * the safety catch): that removes every song and every Blob file behind
 * them (stems, renditions, MIDI, demos, attachments of the songs and of the project itself, notation files with their rendered PDFs, mixes), across both stores, then
 * the rows, children first (src/lib/server/cascade.ts: the database does
 * not run the schema's cascades).
 */
export async function setProjectStatus(accountId: string, id: string, status: ArchiveStatus) {
	const [row] = await db
		.update(project)
		.set({ status })
		.where(and(eq(project.accountId, accountId), eq(project.id, id)))
		.returning({ id: project.id });
	return !!row;
}

/** Archived projects of an account, for the list's "Archived" section. */
export function listArchivedProjects(accountId: string) {
	return db.query.project.findMany({
		where: and(eq(project.accountId, accountId), eq(project.status, "archived")),
		orderBy: [asc(project.name)],
	});
}

/** "deleted", or why not: "active" (archive it first) or "missing". */
export async function deleteProject(
	accountId: string,
	id: string,
): Promise<"deleted" | "active" | "missing"> {
	const target = await db.query.project.findFirst({
		columns: { status: true, imageUrl: true },
		where: and(eq(project.accountId, accountId), eq(project.id, id)),
	});
	if (!target) return "missing";
	if (target.status !== "archived") return "active";
	const songs = await db
		.select({ id: song.id, mixUrl: song.mixUrl })
		.from(song)
		.where(and(eq(song.accountId, accountId), eq(song.projectId, id)));
	const songIds = songs.map((s) => s.id);
	const stems = songIds.length
		? await db
				.select({ url: stem.url, playbackUrl: stem.playbackUrl, midiUrl: stem.midiUrl })
				.from(stem)
				.where(inArray(stem.songId, songIds))
		: [];
	const demos = songIds.length
		? await db
				.select({ url: demo.url, playbackUrl: demo.playbackUrl })
				.from(demo)
				.where(inArray(demo.songId, songIds))
		: [];
	// Every attachment of the project: its songs' and its own (docs/uploads-and-blob.md, "Attachments").
	const files = await db
		.select({ url: songFile.url, thumbnailUrl: songFile.thumbnailUrl })
		.from(songFile)
		.where(eq(songFile.projectId, id));
	const notation = songIds.length
		? await db
				.select({
					url: songNotation.url,
					thumbnailUrl: songNotation.thumbnailUrl,
					pdfUrl: songNotation.pdfUrl,
				})
				.from(songNotation)
				.where(inArray(songNotation.songId, songIds))
		: [];
	await deleteBlobs([
		...stems.flatMap((r) => [r.url, r.playbackUrl ?? "", r.midiUrl ?? ""]),
		...demos.flatMap((d) => [d.url, d.playbackUrl ?? ""]),
		...files.flatMap((f) => [f.url, f.thumbnailUrl ?? ""]),
		...notation.flatMap((n) => [n.url, n.thumbnailUrl ?? "", n.pdfUrl ?? ""]),
		...songs.map((s) => s.mixUrl ?? ""),
		target.imageUrl ?? "",
	]);
	await deleteProjectRows([id]);
	return "deleted";
}
