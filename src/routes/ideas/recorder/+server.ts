import { redirect } from "@sveltejs/kit";

/** The Idea Recorder's old address (docs/demo-recording.md, "Lark"): for good, to /idea-recorder, with its `?song=` and the rest. */
export const GET = ({ url }: { url: URL }) => redirect(301, `/idea-recorder${url.search}`);
