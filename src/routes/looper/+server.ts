import { redirect } from "@sveltejs/kit";

/** The looper's old address (docs/looper.md): for good, to /whirl. */
export const GET = ({ url }: { url: URL }) => redirect(301, `/whirl${url.search}`);
