import { redirect } from "@sveltejs/kit";

/** The Idea Recorder's old address (docs/demo-recording.md, "Lark"): for good, to /idea-recorder, with its `?song=` and the rest. On a deployment vercel.json answers first (a 308 at the edge, the query kept); this covers the dev server. */
export const GET = ({ url }: { url: URL }) => redirect(301, `/idea-recorder${url.search}`);
