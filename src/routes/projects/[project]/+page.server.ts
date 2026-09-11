import { createSong, getProject } from "$lib/server/data";
import { formString } from "$lib/server/form";
import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals }) => {
	const project = await getProject(locals.account.id, params.project);
	if (!project) error(404, `No project "${params.project}"`);
	return { project };
};

export const actions: Actions = {
	createSong: async ({ request, params, locals }) => {
		const project = await getProject(locals.account.id, params.project);
		if (!project) error(404, `No project "${params.project}"`);
		const title = formString(await request.formData(), "title");
		if (!title) return fail(400, { title, error: "Give the song a title." });
		const row = await createSong(locals.account.id, locals.user.id, project.id, title);
		redirect(303, `/projects/${project.slug}/${row.slug}`);
	},
};
