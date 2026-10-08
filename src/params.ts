import { defineParams } from "@sveltejs/kit/params";
// A relative import with its real extension: SvelteKit's build loads this file
// straight into Node (no bundler to resolve #lib or a .js-for-.ts import).
import { SONG_DOC_KINDS } from "./lib/val/SongDocKindSchema.ts";

/** `…/[song]/chart`, `/lyrics` and `/notes` share one editor route. */
const matchSongDoc = (param: string) => (SONG_DOC_KINDS as readonly string[]).includes(param);

export const params = defineParams({
	songDoc: (param) => (matchSongDoc(param) ? param : undefined),
});
