import { findContact, listEvents } from "#lib/server/data.js";
import { memberPageAccount } from "#lib/server/memberPageAccount.js";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/**
 * A contact of the account: their name, role, phone, email, address and
 * notes, and the shows that name them as promoter. Members only; another
 * account's contact is a 404.
 */
export const load: PageServerLoad = async (event) => {
	const account = await memberPageAccount(event);
	const contact = await findContact(account.id, event.params.id);
	if (!contact) error(404, "Not found");
	const events = await listEvents(account.id, "show", { contactId: contact.id });
	return { contact, events };
};
