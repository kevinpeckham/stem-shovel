import { demoOwnership, mixOwnership } from "#lib/server/data.js";
import { error } from "@sveltejs/kit";

/**
 * What a share of a song is aimed at, when it names one: a mix
 * (docs/mixes.md) or a demo recording, which must be that song's (a 404
 * otherwise, as for any id the caller may not reach). `path` is the aim's
 * page under the song's address ("" for the song itself) and `ids` what the
 * share link records. The schemas refuse a mix and a demo together.
 */
export async function songShareAim(songId: string, mixId: string, demoId: string) {
	const mix = mixId ? await mixOwnership(mixId) : null;
	if (mixId && mix?.songId !== songId) error(404, "Mix not found");
	const demo = demoId ? await demoOwnership(demoId) : null;
	if (demoId && demo?.songId !== songId) error(404, "Demo not found");
	if (mix) return { mix, demo: null, path: `/mixes/${mix.id}`, ids: { mixId: mix.id } };
	if (demo) return { mix: null, demo, path: `/demos/${demo.id}`, ids: { demoId: demo.id } };
	return { mix: null, demo: null, path: "", ids: {} };
}
