import { form, getRequestEvent } from "$app/server";
import { createProject as create, updateProject as update } from "$lib/server/data";
import { ProjectCreateSchema, ProjectSettingsSchema } from "$lib/val/ProjectSchema";
import { invalid, redirect } from "@sveltejs/kit";

/** Who is acting. Until sign-in exists this is the seeded owner (hooks.server.ts). */
function requireAccount() {
	const { locals } = getRequestEvent();
	return { accountId: locals.account.id, userId: locals.user.id };
}

/**
 * Project settings: name and URL slug. Shape is validated by the schema;
 * uniqueness and existence are checked in the handler and reported through
 * `invalid()` so the message lands on the field. A slug change means a new
 * address, so the handler redirects there.
 */
export const updateProject = form(ProjectSettingsSchema, async ({ id, name, slug }, issue) => {
	const { accountId } = requireAccount();
	const result = await update(accountId, id, { name, slug });
	if (!result.ok) invalid(issue[result.field](result.error));
	// Always land on the (possibly new) address; a same-slug save is a no-op redirect.
	redirect(303, `/projects/${result.project.slug}`);
});

/** New project; lands on its page. */
export const createProject = form(ProjectCreateSchema, async ({ name }) => {
	const { accountId, userId } = requireAccount();
	const row = await create(accountId, userId, name);
	redirect(303, `/projects/${row.slug}`);
});
