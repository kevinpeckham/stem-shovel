import { viewerOf } from "$lib/server/access";
import { openShareLinks, projectRoleOf, projectViewRow } from "$lib/server/data";
import { projectChartsZip } from "$lib/server/documentation";
import { canViewProject, canViewSong, shareCodesFrom } from "$lib/server/viewAccess";
import { attachmentDisposition } from "$lib/utils/attachmentDisposition";
import type { Config } from "@sveltejs/adapter-vercel";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/** Every score and notation file is read from Blob and every chart rendered, in the request. */
export const config: Config = { maxDuration: 120 };

/**
 * The project's charts in one zip, a folder per song (docs/uploads-and-blob.md,
 * "Documentation downloads"): each score's rendered PDF and MusicXML file,
 * each attachment marked as notation, and the chart text as markdown and
 * as a PDF; named `<project> charts.zip`. Viewable like the project page,
 * private songs left out for those who may not see them. 404 when there is
 * nothing to put in.
 */
export const GET: RequestHandler = async ({ params, url, locals, cookies }) => {
	const project = await projectViewRow(params.id);
	if (!project) error(404, "Not found");
	const role = locals.user ? await projectRoleOf(project.id, locals.user.id) : null;
	const who = viewerOf(locals, project.accountId, role ? { [project.id]: role } : {});
	const grants = await openShareLinks(shareCodesFrom(url, cookies));
	if (!canViewProject(project, who, grants)) error(403, "This project is private");
	const zip = await projectChartsZip(project.accountId, project.id, {
		includeSong: (s) => canViewSong({ ...s, project }, who, grants),
	});
	if (!zip) error(404, "No song in this project has a chart, a score or a notation file yet.");
	return new Response(new Uint8Array(zip), {
		headers: {
			"content-type": "application/zip",
			"content-length": String(zip.byteLength),
			"content-disposition": attachmentDisposition(`${project.name} charts.zip`),
			"cache-control": "private, no-store",
		},
	});
};
