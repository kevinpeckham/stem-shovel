import { accountOfSong } from "$lib/server/access";
import { songForMix } from "$lib/server/data";
import { isOriginal, originalMix, parseMixRequest, renderMix } from "$lib/server/mix";
import { error } from "@sveltejs/kit";
import type { Config } from "@sveltejs/adapter-vercel";
import type { RequestHandler } from "./$types";

/** Rendering fetches every stem and runs ffmpeg; give it the full function budget. */
export const config: Config = { maxDuration: 300 };

/**
 * MP3 mixdown of a song. No query = the original mix (cached); `?stems=id:gain,…&master=m`
 * = a custom mix of what the player has audible. Public like every other view of a song.
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const song = await songForMix(params.id);
	if (!song || song.stems.length === 0) error(404, "No stems to mix");
	const req = parseMixRequest(song, url.searchParams);
	if (!req) error(400, "Bad mix request");
	const accountId = await accountOfSong(song.id);
	if (!accountId) error(404, "Not found");

	const original = isOriginal(song, req);
	const bytes = original ? await originalMix(song, accountId) : await renderMix(song, req);
	const name = `${song.project.slug}-${song.slug}-${original ? "mix" : "custom-mix"}.mp3`;
	return new Response(new Uint8Array(bytes), {
		headers: {
			"content-type": "audio/mpeg",
			"content-length": String(bytes.byteLength),
			"content-disposition": `attachment; filename="${name}"`,
			"cache-control": "no-store",
		},
	});
};
