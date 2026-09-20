import { form, getRequestEvent } from "$app/server";
import { accountOfProject, memberOf, requireMember, requireUser } from "$lib/server/access";
import { createProject as create, projectSlugs, updateProject as update } from "$lib/server/data";
import { deleteProject as removeProject, setProjectStatus } from "$lib/server/projectLifecycle";
import { ProjectCreateSchema, ProjectSettingsSchema } from "$lib/val/ProjectSchema";
import { IdSchema } from "$lib/val/SongSchema";
import { error, invalid, redirect } from "@sveltejs/kit";

/**
 * Project settings: name and URL slug. Shape is validated by the schema;
 * uniqueness and existence are checked in the handler and reported through
 * `invalid()` so the message lands on the field. The account comes from the
 * project itself, checked against the caller's memberships.
 */
export const updateProject = form(
	ProjectSettingsSchema,
	async ({ id, name, slug, type }, issue) => {
		const { locals } = getRequestEvent();
		const { accountId } = await memberOf(locals, accountOfProject, id);
		const result = await update(accountId, id, { name, slug, type });
		if (!result.ok) invalid(issue[result.field](result.error));
		const slugs = await projectSlugs(accountId, id);
		if (!slugs) error(404, "Project not found");
		redirect(303, `/${slugs.account}/projects/${slugs.project}`);
	},
);

/** New project in the given account; lands on its page. */
export const createProject = form(ProjectCreateSchema, async ({ accountId, name }) => {
	const { locals } = getRequestEvent();
	const m = requireMember(locals, accountId);
	const row = await create(accountId, requireUser(locals).id, name);
	redirect(303, `/${m.slug}/projects/${row.slug}`);
});

/** Any member archives a project: it leaves the list for the "Archived" section; songs and files stay. */
export const archiveProject = form(IdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const m = await memberOf(locals, accountOfProject, id);
	if (!(await setProjectStatus(m.accountId, id, "archived"))) error(404, "Project not found");
	redirect(303, `/${m.slug}/projects`);
});

export const restoreProject = form(IdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const m = await memberOf(locals, accountOfProject, id);
	if (!(await setProjectStatus(m.accountId, id, "active"))) error(404, "Project not found");
	const slugs = await projectSlugs(m.accountId, id);
	redirect(303, slugs ? `/${slugs.account}/projects/${slugs.project}` : `/${m.slug}/projects`);
});

/** Owners and admins delete an archived project with every song and file in it. */
export const deleteProject = form(IdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const m = await memberOf(locals, accountOfProject, id);
	if (m.role !== "owner" && m.role !== "admin")
		error(403, "Only owners and admins delete projects");
	const result = await removeProject(m.accountId, id);
	if (result === "missing") error(404, "Project not found");
	if (result === "active") error(409, "Archive the project before deleting it");
	redirect(303, `/${m.slug}/projects`);
});
