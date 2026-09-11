import { form, getRequestEvent } from "$app/server";
import { updateAccount as update } from "$lib/server/data";
import { AccountSettingsSchema } from "$lib/val/AccountSchema";
import { error, invalid, redirect } from "@sveltejs/kit";

/**
 * Account (org) settings: name and slug. Only the account the caller belongs
 * to can be edited; the id in the form must match it.
 */
export const updateAccount = form(AccountSettingsSchema, async ({ id, name, slug }, issue) => {
	const { locals } = getRequestEvent();
	if (id !== locals.account.id) error(403, "Not your account");
	const result = await update(id, { name, slug });
	if (!result.ok) invalid(issue[result.field](result.error));
	redirect(303, "/settings");
});
