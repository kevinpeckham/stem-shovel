import { waitlistByManageToken } from "$lib/server/data";
import { WaitlistTokenSchema } from "$lib/val/WaitlistSchema";
import { error } from "@sveltejs/kit";
import * as v from "valibot";
import type { PageServerLoad } from "./$types";

/** The link at the end of every waitlist email: consent and leaving, no sign-in needed. */
export const load: PageServerLoad = async ({ params }) => {
	const token = v.safeParse(WaitlistTokenSchema, params.token);
	const row = token.success ? await waitlistByManageToken(token.output) : null;
	if (!row) error(404, "That link is not valid");
	return { token: row.manageToken, email: row.email, status: row.status, updatesOk: row.updatesOk };
};
