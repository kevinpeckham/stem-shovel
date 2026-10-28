import { command, form, getRequestEvent } from "$app/server";
import {
	accountOfEvent,
	accountOfEventSet,
	memberOf,
	requireEditor,
	requireUser,
} from "#lib/server/access.js";
import {
	addEventSet as addSet,
	createEvent as create,
	deleteEvent as remove,
	linkEventSession as linkSession,
	removeEventSet as removeSet,
	reorderEventSets as reorderSets,
	updateEvent as update,
	updateEventSetLabel as updateSetLabel,
} from "#lib/server/data.js";
import {
	EventCreateSchema,
	EventIdSchema,
	EventSessionLinkSchema,
	EventSetAddSchema,
	EventSetIdSchema,
	EventSetLabelSchema,
	EventSetReorderSchema,
	EventUpdateSchema,
} from "#lib/val/EventSchema.js";
import { error, redirect } from "@sveltejs/kit";

/** A new show or practice (docs/band-plan.md, "Event") in the account; an editor of it. Lands on its page. */
export const createEvent = form(
	EventCreateSchema,
	async ({ accountId, kind, title, startsOn, venue }) => {
		const { locals } = getRequestEvent();
		const user = requireUser(locals);
		const m = requireEditor(locals, accountId);
		const row = await create(accountId, user.id, { kind, title, startsOn, venue });
		if (!row) error(409, "This account holds as many shows and practices as it may.");
		redirect(303, `/${m.slug}/events/${row.id}`);
	},
);

/** The event's own words: when, where and the notes; an editor of its account. */
export const updateEvent = form(EventUpdateSchema, async ({ id, ...fields }) => {
	const { locals } = getRequestEvent();
	requireUser(locals);
	const { accountId } = await memberOf(locals, accountOfEvent, id);
	if (!(await update(accountId, id, fields))) error(404, "Not found");
	return { ok: true };
});

/** The event and its sets; its sessions stay, untied. */
export const deleteEvent = command(EventIdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	requireUser(locals);
	const { accountId } = await memberOf(locals, accountOfEvent, id);
	if (!(await remove(accountId, id))) error(404, "Not found");
	return { deleted: true };
});

/** A set list of the account attached as the event's last set. */
export const addEventSet = command(EventSetAddSchema, async ({ eventId, setListId }) => {
	const { locals } = getRequestEvent();
	requireUser(locals);
	const { accountId } = await memberOf(locals, accountOfEvent, eventId);
	const row = await addSet(accountId, eventId, setListId);
	if (row === "full") error(409, "This show has as many sets as it may.");
	if (!row) error(404, "Not found");
	return row;
});

/** A set's label ("Set 1", "Encore"). */
export const updateEventSetLabel = command(EventSetLabelSchema, async ({ id, label }) => {
	const { locals } = getRequestEvent();
	requireUser(locals);
	const { accountId } = await memberOf(locals, accountOfEventSet, id);
	const row = await updateSetLabel(accountId, id, label);
	if (!row) error(404, "Not found");
	return row;
});

/** The set off the event; the set list stays. */
export const removeEventSet = command(EventSetIdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	requireUser(locals);
	const { accountId } = await memberOf(locals, accountOfEventSet, id);
	if (!(await removeSet(accountId, id))) error(404, "Not found");
	return { deleted: true };
});

/** The sets in a new order: every set of the event, once each (400 otherwise). */
export const reorderEventSets = command(EventSetReorderSchema, async ({ eventId, ids }) => {
	const { locals } = getRequestEvent();
	requireUser(locals);
	const { accountId } = await memberOf(locals, accountOfEvent, eventId);
	if (!(await reorderSets(accountId, eventId, ids)))
		error(400, "The sets changed; reload the page and try again.");
	return { ok: true };
});

/** A recording session of the account tied to the event (moved from any other) or untied from it. */
export const linkEventSession = command(
	EventSessionLinkSchema,
	async ({ eventId, sessionId, linked }) => {
		const { locals } = getRequestEvent();
		requireUser(locals);
		const { accountId } = await memberOf(locals, accountOfEvent, eventId);
		if (!(await linkSession(accountId, eventId, sessionId, linked))) error(404, "Not found");
		return { linked };
	},
);
