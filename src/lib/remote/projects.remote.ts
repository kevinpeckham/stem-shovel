import { form, getRequestEvent } from "$app/server";
import { accountOfProject, memberOf, requireMember, requireUser } from "$lib/server/access";
import {
	addProjectMember as addPerson,
	createInvitation,
	createProject as create,
	projectSlugs,
	removeProjectPerson as removePerson,
	revokeInvitation as revoke,
	setProjectRestricted as setRestricted,
	updateProject as update,
} from "$lib/server/data";
import { sendInvitationEmail } from "$lib/server/email";
import { invitationProject } from "$lib/server/data";
import { HOUR, rateLimited } from "$lib/server/rateLimit";
import { InvitationIdSchema, ProjectInviteSchema } from "$lib/val/InvitationSchema";
import { deleteProject as removeProject, setProjectStatus } from "$lib/server/projectLifecycle";
import {
	ProjectCreateSchema,
	ProjectPersonSchema,
	ProjectRestrictSchema,
	ProjectSettingsSchema,
} from "$lib/val/ProjectSchema";
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

// ---- people on a project (docs/auth.md) --------------------------------------
// Whoever may edit the project (memberOf: owners and admins, members unless the
// project is restricted and they were not added) manages who else is on it.

/** Restrict the project to the people added to it, or open it to every member again. */
export const setProjectRestricted = form(ProjectRestrictSchema, async ({ id, restricted }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfProject, id);
	if (!(await setRestricted(accountId, id, restricted === "true"))) error(404, "Project not found");
	return { restricted: restricted === "true" };
});

/** Invites an address to view this project (no account membership, no seat) and emails the link. */
export const inviteProjectViewer = form(
	ProjectInviteSchema,
	async ({ projectId, email }, issue) => {
		const { locals, url } = getRequestEvent();
		const user = requireUser(locals);
		const m = await memberOf(locals, accountOfProject, projectId);
		if (await rateLimited(`invite:${user.id}`, 30, HOUR))
			error(429, "Too many invitations in one hour.");
		const slugs = await projectSlugs(m.accountId, projectId);
		if (!slugs) error(404, "Project not found");
		const row = await createInvitation(m.accountId, user.id, email, "viewer", projectId);
		if (row === "member") invalid(issue.email("They are on this project already."));
		if (row === "full") error(409, "No seats left"); // not reached: a viewer takes none
		await sendInvitationEmail({
			to: row.email,
			url: `${url.origin}/invite/${row.token}`,
			accountName: m.name,
			inviterName: user.name || user.email,
			inviterEmail: user.email,
			role: "viewer",
			projectName: slugs.projectName,
		});
		return { sent: row.email };
	},
);

export const revokeProjectInvitation = form(InvitationIdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	// The invitation names its project; the project names its account, which the caller must edit.
	const row = await invitationProject(id);
	if (!row) error(404, "Invitation not found");
	const { accountId } = await memberOf(locals, accountOfProject, row.projectId);
	if (!(await revoke(accountId, id))) error(404, "Invitation not found");
	return { revoked: true };
});

/** Adds a member of the account to the project (what a restricted project needs). */
export const addProjectMember = form(ProjectPersonSchema, async ({ projectId, userId }, issue) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfProject, projectId);
	const r = await addPerson(accountId, projectId, userId, requireUser(locals).id);
	if (!r.ok) invalid(issue.userId(r.error));
	return { added: !r.already };
});

/** Takes anyone off the project: a viewer loses access, a member of a restricted project too. */
export const removeProjectPerson = form(ProjectPersonSchema, async ({ projectId, userId }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfProject, projectId);
	if (!(await removePerson(accountId, projectId, userId))) error(404, "Not on this project");
	return { removed: true };
});
