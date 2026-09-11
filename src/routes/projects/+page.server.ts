import { createProject, listProjects } from "$lib/server/data";
import { formString } from "$lib/server/form";
import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	return { projects: await listProjects(locals.account.id) };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const name = formString(await request.formData(), "name");
		if (!name) return fail(400, { name, error: "Give the project a name." });
		const row = await createProject(locals.account.id, locals.user.id, name);
		redirect(303, `/projects/${row.slug}`);
	},
};
