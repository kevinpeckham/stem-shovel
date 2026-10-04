import { command, getRequestEvent } from "$app/server";
import { aiAvailable } from "$lib/server/aiDetect";
import { HOUR, rateLimited } from "$lib/server/rateLimit";
import { textToChords as ask } from "$lib/server/textToChords";
import { TextToChordsSchema } from "$lib/val/TextToChordsSchema";
import { error } from "@sveltejs/kit";

/** A progression from a description (docs/chord-player.md, "Text-to-Progression"); anyone at the chord player, a few an hour each, while the gateway is configured. */
export const textToChords = command(TextToChordsSchema, async (input) => {
	const { locals, getClientAddress } = getRequestEvent();
	if (!aiAvailable()) error(503, "Text-to-Progression is not available here");
	const who = locals.user?.id ?? getClientAddress();
	if (await rateLimited(`text-to-chords:${who}`, 20, HOUR))
		error(429, "That is a lot of progressions for one hour; try again later");
	try {
		return await ask(input, { userId: locals.user?.id ?? null });
	} catch (e) {
		error(502, e instanceof Error ? e.message : "The model did not answer");
	}
});
