import { getSong, saveChart } from "$lib/server/data";
import { formString } from "$lib/server/form";
import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals }) => {
	const song = await getSong(locals.account.id, params.project, params.song);
	if (!song) error(404, `No song "${params.song}" in "${params.project}"`);
	return {
		song: {
			id: song.id,
			title: song.title,
			slug: song.slug,
			project: song.project,
			chartMarkdown: song.chartMarkdown,
			chartVersion: song.chartVersion,
		},
	};
};

export const actions: Actions = {
	save: async ({ request, params, locals }) => {
		const song = await getSong(locals.account.id, params.project, params.song);
		if (!song) error(404);
		const data = await request.formData();
		const result = await saveChart(
			locals.account.id,
			locals.user.id,
			song.id,
			formString(data, "markdown"),
			{
				confirmEmpty: formString(data, "confirmEmpty") === "true",
			},
		);
		if (!result.ok)
			return fail(400, { error: result.error, needsConfirm: result.needsConfirm ?? false });
		return { saved: true, version: result.version, changed: result.changed };
	},
};
