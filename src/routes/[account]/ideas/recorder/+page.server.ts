import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** The Idea Recorder left the account's URL space on 2026-10-01 (ideas are the user's own, docs/demo-recording.md): old links, with their `?song=`, go to the new page. */
export const load: PageServerLoad = ({ url }) => {
	redirect(303, `/ideas/recorder${url.search}`);
};
