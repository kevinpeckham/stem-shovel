import { userDetail } from "$lib/server/data";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** One user in depth (the layout already requires a system admin). */
export const load: PageServerLoad = async ({ params }) => {
	const user = await userDetail(params.id);
	if (!user) error(404, "No such user");
	return { user };
};
