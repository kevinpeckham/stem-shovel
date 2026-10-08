import { viewerOf } from "#lib/server/access.js";
import { openShareLinks, projectRoleOf, projectViewRow } from "#lib/server/data.js";
import { projectDocumentationZip } from "#lib/server/documentation.js";
import { canViewProject, canViewSong, shareCodesFrom } from "#lib/server/viewAccess.js";
import { attachmentDisposition } from "#lib/utils/attachmentDisposition.js";
import type { Config } from "@sveltejs/adapter-vercel";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/** A PDF per song, rendered in the request; the budget covers a long project on a cold function. */
export const config: Config = { maxDuration: 120 };

/**
 * Every song's documentation PDF in one zip (docs/uploads-and-blob.md,
 * "Documentation downloads"), named `<project> documentation.zip`.
 * Viewable like the project page: members, the project's viewers, or a
 * share code; a private song inside a public project is left out of the
 * zip for those who may not see it. 404 when no song has any text.
 */
export const GET: RequestHandler = async ({ params, url, locals, cookies }) => {
	const project = await projectViewRow(params.id);
	if (!project) error(404, "Not found");
	const role = locals.user ? await projectRoleOf(project.id, locals.user.id) : null;
	const who = viewerOf(locals, project.accountId, role ? { [project.id]: role } : {});
	const grants = await openShareLinks(shareCodesFrom(url, cookies));
	if (!canViewProject(project, who, grants)) error(403, "This project is private");
	const zip = await projectDocumentationZip(project.accountId, project.id, {
		includeSong: (s) => canViewSong({ ...s, project }, who, grants),
	});
	if (!zip) error(404, "No song in this project has lyrics, a chart or notes yet.");
	return new Response(new Uint8Array(zip), {
		headers: {
			"content-type": "application/zip",
			"content-length": String(zip.byteLength),
			"content-disposition": attachmentDisposition(`${project.name} documentation.zip`),
			"cache-control": "private, no-store",
		},
	});
};
