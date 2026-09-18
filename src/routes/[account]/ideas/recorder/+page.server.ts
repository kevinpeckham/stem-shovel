import { requireMember, requireSignedIn } from "$lib/server/access";
import { songLink, songPicker } from "$lib/server/data";
import { NanoIdSchema } from "$lib/val/NanoIdSchema";
import * as v from "valibot";
import type { PageServerLoad } from "./$types";

/** The demo recorder (docs/demo-recording.md): members only; `?song=<id>` remembers where it was opened from. */
export const load: PageServerLoad = async ({ parent, locals, url }) => {
	requireSignedIn(locals, url);
	const { account } = await parent();
	requireMember(locals, account.id);
	const songParam = url.searchParams.get("song");
	const songId = v.safeParse(NanoIdSchema, songParam ?? "");
	return {
		projects: await songPicker(account.id),
		fromSong: songId.success ? await songLink(account.id, songId.output) : null,
	};
};
