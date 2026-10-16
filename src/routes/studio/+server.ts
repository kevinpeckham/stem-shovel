import { redirect } from "@sveltejs/kit";

/** The multitrack recorder's old address (docs/multitrack-recorder.md, "Dawn: the rename"): for good, to /multitrack-recorder. On a deployment vercel.json answers first (a 308 at the edge); this covers the dev server. */
export const GET = () => redirect(301, "/multitrack-recorder");
