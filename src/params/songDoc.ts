import { SONG_DOC_KINDS } from "$lib/val/SongDocKindSchema";
import type { ParamMatcher } from "@sveltejs/kit";

/** `/projects/[project]/[song]/chart` and `/lyrics` share one editor route. */
export const match: ParamMatcher = (param) => (SONG_DOC_KINDS as readonly string[]).includes(param);
