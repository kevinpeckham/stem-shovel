import { sendDigests } from "#lib/server/notifications.js";
import { purgeExpiredShortLinks } from "#lib/server/shortLinks.js";
import type { Config } from "@sveltejs/adapter-vercel";
import type { RequestHandler } from "./$types";

/** Many people's digests in one run; give it the full function budget. */
export const config: Config = { maxDuration: 300 };

/**
 * Sends the daily and weekly digests that are due. A Vercel cron
 * (vercel.json) calls it once a day; anyone may call it, since a digest
 * goes out only when a day or a week has passed since the person's last,
 * so an extra call sends nothing. The same daily run sweeps the expired
 * short links (src/lib/server/shortLinks.ts); a failure there is logged
 * and never stops the digests.
 */
export const GET: RequestHandler = async () => {
	const { sent } = await sendDigests();
	let purged = 0;
	try {
		purged = await purgeExpiredShortLinks();
	} catch (e) {
		console.error("[short-links] purge failed:", e);
	}
	return Response.json({ ok: true, sent, purged }, { headers: { "cache-control": "no-store" } });
};
