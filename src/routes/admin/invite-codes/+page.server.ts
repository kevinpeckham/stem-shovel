import { listInviteCodes } from "$lib/server/data";
import type { PageServerLoad } from "./$types";

/** System (new-account) codes: the ones with no account. */
export const load: PageServerLoad = async () => ({ inviteCodes: await listInviteCodes(null) });
