import { redirect } from "@sveltejs/kit";

/** The Practice Amp's old address (docs/practice-amp.md): for good, to /ember; a browser keeps the `#amp=` hash across it. */
export const GET = ({ url }: { url: URL }) => redirect(301, `/ember${url.search}`);
