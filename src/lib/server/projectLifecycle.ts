import { deleteBlobs } from "$lib/server/blob";
import { deleteProjectRows } from "$lib/server/cascade";
import { db, schema } from "$lib/server/db";
import type { ArchiveStatus } from "$lib/val/ArchiveStatusSchema";
import { and, asc, eq, inArray } from "drizzle-orm";

const { project, song, stem, demo } = schema;

/**
 * Archiving and deleting projects (src/lib/remote/projects.remote.ts). Any
 * member archives or restores: an archived project leaves the projects
 * list for an "Archived" section and keeps its songs and files. Only an
 * owner or admin deletes, and only an archived project (archiving first is
 * the safety catch): that removes every song and every Blob file behind
 * them (stems, renditions, MIDI, demos, mixes), across both stores, then
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
		columns: { status: true },
		where: and(eq(project.accountId, accountId), eq(project.id, id)),
	});
	if (!target) return "missing";
	if (target.status !== "archived") return "active";
	const songs = await db
		.select({ id: song.id, mixUrl: song.mixUrl, imageUrl: song.imageUrl })
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
	await deleteBlobs([
		...stems.flatMap((r) => [r.url, r.playbackUrl ?? "", r.midiUrl ?? ""]),
		...demos.flatMap((d) => [d.url, d.playbackUrl ?? ""]),
		...songs.flatMap((s) => [s.mixUrl ?? "", s.imageUrl ?? ""]),
	]);
	await deleteProjectRows([id]);
	return "deleted";
}
