import { redirect } from "@sveltejs/kit";

/** The multitrack recorder's old address (docs/multitrack-recorder.md, "Dawn: the rename"): for good, to /multitrack-recorder. */
export const GET = () => redirect(301, "/multitrack-recorder");
