import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** The Idea Recorder left the account's URL space on 2026-10-01 (ideas are the user's own, docs/demo-recording.md): old links, with their `?song=`, go to the new page. (Not a vercel.json rule: `/:account/ideas/recorder` at the edge would catch a static route's address too; SvelteKit puts static routes first.) */
export const load: PageServerLoad = ({ url }) => {
	redirect(303, `/idea-recorder${url.search}`);
};
