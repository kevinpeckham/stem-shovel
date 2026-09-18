import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** The ideas section's front is the library; the recorder sits beside it. */
export const load: PageServerLoad = ({ params }) => {
	redirect(303, `/${params.account}/ideas/recordings`);
};
