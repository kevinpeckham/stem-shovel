import { sendEventReminders } from "#lib/server/calendar.js";
import { sendDigests } from "#lib/server/notifications.js";
import { purgeExpiredShortLinks } from "#lib/server/shortLinks.js";
import type { Config } from "@sveltejs/adapter-vercel";
import type { RequestHandler } from "./$types";

/** Many people's digests in one run; give it the full function budget. */
export const config: Config = { maxDuration: 300 };

const DAY = 24 * 60 * 60 * 1000;

/**
 * Sends the daily and weekly digests that are due. A Vercel cron
 * (vercel.json) calls it once a day; anyone may call it, since a digest
 * goes out only when a day or a week has passed since the person's last,
 * so an extra call sends nothing. The same daily run sweeps the expired
 * short links (src/lib/server/shortLinks.ts); a failure there is logged
 * and never stops the digests. Last, the day-before reminders of
 * tomorrow's shows and practices (src/lib/server/calendar.ts), which never
 * throw; a second call the same day reminds nobody twice.
 */
export const GET: RequestHandler = async () => {
	const { sent } = await sendDigests();
	let purged = 0;
	try {
		purged = await purgeExpiredShortLinks();
	} catch (e) {
		console.error("[short-links] purge failed:", e);
	}
	// The cron runs at 13:00 UTC, morning in the Americas and evening in Europe: "tomorrow" is the UTC date plus one, which is everyone's tomorrow at that hour from UTC-12 to UTC+10.
	const tomorrow = new Date(Date.now() + DAY).toISOString().slice(0, 10);
	const reminded = await sendEventReminders(tomorrow);
	return Response.json(
		{ ok: true, sent, purged, reminded },
		{ headers: { "cache-control": "no-store" } },
	);
};
