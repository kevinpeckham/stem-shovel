import { confirmWaitlist } from "$lib/server/data";
import { WaitlistTokenSchema } from "$lib/val/WaitlistSchema";
import * as v from "valibot";
import type { PageServerLoad } from "./$types";

/** The link from the confirmation email; opening it is the confirmation. */
export const load: PageServerLoad = async ({ params }) => {
	const token = v.safeParse(WaitlistTokenSchema, params.token);
	const row = token.success ? await confirmWaitlist(token.output) : null;
	return row
		? {
				ok: true as const,
				email: row.email,
				manageToken: row.manageToken,
				updatesOk: row.updatesOk,
			}
		: { ok: false as const };
};
