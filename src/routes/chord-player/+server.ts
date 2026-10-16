import { redirect } from "@sveltejs/kit";

/** The chord player's old address (docs/chord-player.md): for good, to /palette; a browser keeps a `#k=` hash across it. */
export const GET = ({ url }: { url: URL }) => redirect(301, `/palette${url.search}`);
