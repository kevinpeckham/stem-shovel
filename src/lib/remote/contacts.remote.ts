import { command, form, getRequestEvent } from "$app/server";
import { accountOfContact, memberOf, requireEditor, requireUser } from "#lib/server/access.js";
import {
	createContact as create,
	deleteContact as remove,
	updateContact as update,
} from "#lib/server/data.js";
import {
	ContactCreateSchema,
	ContactIdSchema,
	ContactUpdateSchema,
} from "#lib/val/ContactSchema.js";
import { error } from "@sveltejs/kit";

/** A new contact (docs/band-plan.md, "The band directory") in the account; an editor of it. */
export const createContact = command(ContactCreateSchema, async ({ accountId, ...fields }) => {
	const { locals } = getRequestEvent();
	requireEditor(locals, accountId);
	const r = await create(accountId, requireUser(locals).id, fields);
	if (r === "full") error(409, "This account holds as many contacts as it may.");
	return r;
});

/** A contact's name, role, phone, email, address and notes; an editor of its account. */
export const updateContact = form(ContactUpdateSchema, async ({ id, ...fields }) => {
	const { locals } = getRequestEvent();
	requireUser(locals);
	const { accountId } = await memberOf(locals, accountOfContact, id);
	if (!(await update(accountId, id, fields))) error(404, "Not found");
	return { ok: true };
});

/** A contact gone; the shows that named it keep their one-off promoter fields. */
export const deleteContact = command(ContactIdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	requireUser(locals);
	const { accountId } = await memberOf(locals, accountOfContact, id);
	if (!(await remove(accountId, id))) error(404, "Not found");
	return { ok: true };
});
