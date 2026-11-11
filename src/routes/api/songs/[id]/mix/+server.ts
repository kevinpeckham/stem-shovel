import { accountOfSong } from "#lib/server/access.js";
import { songForMix } from "#lib/server/data.js";
import { requireSongView } from "#lib/server/songViewGate.js";
import { isOriginal, originalMix, parseMixRequest, renderMix } from "#lib/server/mix.js";
import { HOUR, rateLimited } from "#lib/server/rateLimit.js";
import { error } from "@sveltejs/kit";
import type { Config } from "@sveltejs/adapter-vercel";
import type { RequestHandler } from "./$types";

/** Rendering fetches every stem and runs ffmpeg; give it the full function budget. */
export const config: Config = { maxDuration: 300 };

/**
 * MP3 mixdown of a song. No query = the original mix (cached); `?stems=id:gain,…&master=m`
 * = a custom mix of what the player has audible. `?arrangement=<id>` mixes one of the
 * song's alternates (docs/arrangements.md): always rendered, since the cached original is
 * Main's; an id the song does not have has no stems and is a 404. Viewable like the song
 * itself: a private one needs membership or a share code (the cookie rides along).
 */
export const GET: RequestHandler = async ({ params, url, locals, cookies, getClientAddress }) => {
	const arrangementId = url.searchParams.get("arrangement") || null;
	const song = await songForMix(params.id, arrangementId);
	if (!song || song.stems.length === 0) error(404, "No stems to mix");
	const accountId = await accountOfSong(song.id);
	if (!accountId) error(404, "Not found");
	await requireSongView(song, accountId, { locals, url, cookies });
	const req = parseMixRequest(song, url.searchParams);
	if (!req) error(400, "Bad mix request");

	const original = arrangementId === null && isOriginal(song, req);
	// A custom mix runs ffmpeg for every request; the original is cached. Bound the former per caller.
	if (!original && (await rateLimited(`mix:${locals.user?.id ?? getClientAddress()}`, 20, HOUR))) {
		error(429, "Too many custom mixes in one hour; try again later.");
	}
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
