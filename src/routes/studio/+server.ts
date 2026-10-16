import { redirect } from "@sveltejs/kit";

/** The multitrack recorder's old address (docs/multitrack-recorder.md, "Dawn: the rename"): for good, to /dawn. */
export const GET = () => redirect(301, "/dawn");
