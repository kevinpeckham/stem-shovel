import { form, getRequestEvent } from "$app/server";
import { accountOfProject, accountOfSong, memberOf } from "$lib/server/access";
import { setProjectNoAi, setSongNoAi } from "$lib/server/data";
import { AiPolicySchema } from "$lib/val/AiPolicySchema";
import { error } from "@sveltejs/kit";

/**
 * "Do not use AI" for a project or a song (docs/security.md): with it set,
 * no model is called for the song and no transcription runs — the AI
 * buttons disappear and the commands refuse. Any member sets it; some
 * artists' contracts require it.
 */
export const setProjectAi = form(AiPolicySchema, async ({ id, noAi }) => {
	const { locals } = getRequestEvent();
	const m = await memberOf(locals, accountOfProject, id);
	if (!(await setProjectNoAi(m.accountId, id, noAi === "true"))) error(404, "Not found");
	return { noAi: noAi === "true" };
});

export const setSongAi = form(AiPolicySchema, async ({ id, noAi }) => {
	const { locals } = getRequestEvent();
	const m = await memberOf(locals, accountOfSong, id);
	if (!(await setSongNoAi(m.accountId, id, noAi === "true"))) error(404, "Not found");
	return { noAi: noAi === "true" };
});
