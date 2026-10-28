import { command, form, getRequestEvent } from "$app/server";
import {
	accountOfPracticeLocation,
	memberOf,
	requireEditor,
	requireUser,
} from "#lib/server/access.js";
import {
	createPracticeLocation as create,
	deletePracticeLocation as remove,
	updatePracticeLocation as update,
} from "#lib/server/data.js";
import {
	PracticeLocationCreateSchema,
	PracticeLocationIdSchema,
	PracticeLocationUpdateSchema,
} from "#lib/val/PracticeLocationSchema.js";
import { error, invalid } from "@sveltejs/kit";

const DUPLICATE = "A location with that name is already here.";

/** A new practice location (docs/band-plan.md, "Event") in the account; an editor of it. */
export const createPracticeLocation = command(
	PracticeLocationCreateSchema,
	async ({ accountId, ...fields }) => {
		const { locals } = getRequestEvent();
		const user = requireUser(locals);
		requireEditor(locals, accountId);
		const r = await create(accountId, user.id, fields);
		if (r === "full") error(409, "This account holds as many practice locations as it may.");
		if (r === "duplicate") error(409, DUPLICATE);
		return r;
	},
);

/** A practice location's name, address and notes; an editor of its account. */
export const updatePracticeLocation = form(
	PracticeLocationUpdateSchema,
	async ({ id, ...fields }, issue) => {
		const { locals } = getRequestEvent();
		requireUser(locals);
		const { accountId } = await memberOf(locals, accountOfPracticeLocation, id);
		const r = await update(accountId, id, fields);
		if (r === "duplicate") invalid(issue.name(DUPLICATE));
		if (!r) error(404, "Not found");
		return { ok: true };
	},
);

/** A practice location gone; refused while practices are there. */
export const deletePracticeLocation = command(PracticeLocationIdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	requireUser(locals);
	const { accountId } = await memberOf(locals, accountOfPracticeLocation, id);
	const r = await remove(accountId, id);
	if (r === "used") error(409, "This location has practices on the calendar; move them first.");
	if (!r) error(404, "Not found");
	return { ok: true };
});
