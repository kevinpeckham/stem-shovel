import { command, getRequestEvent } from "$app/server";
import { aiAvailable } from "#lib/server/aiDetect.js";
import { HOUR, rateLimited } from "#lib/server/rateLimit.js";
import { textToBeat as ask } from "#lib/server/textToBeat.js";
import { TextToBeatSchema } from "#lib/val/TextToBeatSchema.js";
import { error } from "@sveltejs/kit";

/** A beat from a description (docs/drum-machine.md, "Text-to-Beat"); anyone at the drum machine, a few an hour each, while the gateway is configured. */
export const textToBeat = command(TextToBeatSchema, async (input) => {
	const { locals, getClientAddress } = getRequestEvent();
	if (!aiAvailable()) error(503, "Text-to-Beat is not available here");
	const who = locals.user?.id ?? getClientAddress();
	if (await rateLimited(`text-to-beat:${who}`, 20, HOUR))
		error(429, "That is a lot of beats for one hour; try again later");
	try {
		return await ask(input, { userId: locals.user?.id ?? null });
	} catch (e) {
		error(502, e instanceof Error ? e.message : "The model did not answer");
	}
});
