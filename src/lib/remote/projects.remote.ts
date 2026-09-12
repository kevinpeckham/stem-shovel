import { form, getRequestEvent } from "$app/server";
import { accountOfProject, memberOf, requireMember, requireUser } from "$lib/server/access";
import { createProject as create, projectSlugs, updateProject as update } from "$lib/server/data";
import { ProjectCreateSchema, ProjectSettingsSchema } from "$lib/val/ProjectSchema";
import { error, invalid, redirect } from "@sveltejs/kit";

/**
 * Project settings: name and URL slug. Shape is validated by the schema;
 * uniqueness and existence are checked in the handler and reported through
 * `invalid()` so the message lands on the field. The account comes from the
 * project itself, checked against the caller's memberships.
 */
export const updateProject = form(ProjectSettingsSchema, async ({ id, name, slug }, issue) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfProject, id);
	const result = await update(accountId, id, { name, slug });
	if (!result.ok) invalid(issue[result.field](result.error));
	const slugs = await projectSlugs(accountId, id);
	if (!slugs) error(404, "Project not found");
	redirect(303, `/${slugs.account}/projects/${slugs.project}`);
});

/** New project in the given account; lands on its page. */
export const createProject = form(ProjectCreateSchema, async ({ accountId, name }) => {
	const { locals } = getRequestEvent();
	const m = requireMember(locals, accountId);
	const row = await create(accountId, requireUser(locals).id, name);
	redirect(303, `/${m.slug}/projects/${row.slug}`);
});
