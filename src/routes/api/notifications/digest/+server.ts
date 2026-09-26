import { sendDigests } from "$lib/server/notifications";
import { json } from "@sveltejs/kit";
import type { Config } from "@sveltejs/adapter-vercel";
import type { RequestHandler } from "./$types";

/** Many people's digests in one run; give it the full function budget. */
export const config: Config = { maxDuration: 300 };

/**
 * Sends the daily and weekly digests that are due. A Vercel cron
 * (vercel.json) calls it once a day; anyone may call it, since a digest
 * goes out only when a day or a week has passed since the person's last,
 * so an extra call sends nothing.
 */
export const GET: RequestHandler = async () => {
	const { sent } = await sendDigests();
	return json({ ok: true, sent }, { headers: { "cache-control": "no-store" } });
};
