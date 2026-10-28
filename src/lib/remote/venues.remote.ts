import { command, form, getRequestEvent } from "$app/server";
import { requireEditor, requireUser } from "#lib/server/access.js";
import {
	createVenue as create,
	linkVenue as link,
	searchVenues as search,
	unlinkVenue as unlink,
	updateVenue as update,
	updateVenueNotes as updateNotes,
} from "#lib/server/data.js";
import {
	VenueCreateSchema,
	VenueLinkSchema,
	VenueLocalSchema,
	VenueSearchSchema,
	VenueUpdateSchema,
} from "#lib/val/VenueSchema.js";
import { error, invalid } from "@sveltejs/kit";

const FULL = "This account's venue list is full.";

/**
 * A venue (docs/band-plan.md, "Event") on the account's list: a new one in
 * the shared directory, or the one already there with that name and city;
 * an editor of the account.
 */
export const createVenue = command(VenueCreateSchema, async ({ accountId, ...fields }) => {
	const { locals } = getRequestEvent();
	const user = requireUser(locals);
	requireEditor(locals, accountId);
	const r = await create(accountId, user.id, fields);
	if (r === "full") error(409, FULL);
	return r.venue;
});

/** A venue's shared facts (name, address, city, links); venues are everyone's, so anyone signed in may correct them. */
export const updateVenue = form(VenueUpdateSchema, async ({ id, ...fields }, issue) => {
	const { locals } = getRequestEvent();
	const user = requireUser(locals);
	const r = await update(user.id, id, fields);
	if (r === "duplicate") invalid(issue.name("A venue with that name is already in that city."));
	if (!r) error(404, "Not found");
	return { ok: true };
});

/** The account's own notes and contact at a venue (putting it on the list); an editor of the account. */
export const updateVenueNotes = form(
	VenueLocalSchema,
	async ({ accountId, venueId, notes, contact }) => {
		const { locals } = getRequestEvent();
		requireUser(locals);
		requireEditor(locals, accountId);
		if (!(await updateNotes(accountId, venueId, { notes, contact }))) error(404, "Not found");
		return { ok: true };
	},
);

/** A venue from the directory put on the account's list. */
export const linkVenue = command(VenueLinkSchema, async ({ accountId, venueId }) => {
	const { locals } = getRequestEvent();
	requireUser(locals);
	requireEditor(locals, accountId);
	const row = await link(accountId, venueId);
	if (row === "full") error(409, FULL);
	if (!row) error(404, "Not found");
	return row;
});

/** A venue off the account's list; it stays in the directory. Refused while the account's shows or practices are there. */
export const unlinkVenue = command(VenueLinkSchema, async ({ accountId, venueId }) => {
	const { locals } = getRequestEvent();
	requireUser(locals);
	requireEditor(locals, accountId);
	const r = await unlink(accountId, venueId);
	if (r === "used")
		error(409, "This venue has shows or practices on the calendar; move them first.");
	if (!r) error(404, "Not found");
	return { ok: true };
});

/** The shared directory searched by name or city; anyone signed in. */
export const searchVenues = command(VenueSearchSchema, async ({ q }) => {
	const { locals } = getRequestEvent();
	requireUser(locals);
	return search(q);
});
