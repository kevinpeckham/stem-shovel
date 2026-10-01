import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** The ideas section is the recorder, which now lives outside the account's URL space (ideas are the user's own). */
export const load: PageServerLoad = () => {
	redirect(303, "/ideas/recorder");
};
