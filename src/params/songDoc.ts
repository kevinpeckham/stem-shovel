import { SONG_DOC_KINDS } from "$lib/val/SongDocKindSchema";
import type { ParamMatcher } from "@sveltejs/kit";

/** `…/[song]/chart`, `/lyrics` and `/notes` share one editor route. */
export const match: ParamMatcher = (param) => (SONG_DOC_KINDS as readonly string[]).includes(param);
