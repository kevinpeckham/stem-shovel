import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** The ideas section is the recorder (its list is the library). */
export const load: PageServerLoad = ({ params }) => {
	redirect(303, `/${params.account}/ideas/recorder`);
};
