import { db } from "#lib/server/db/index.js";
import type { Config } from "@sveltejs/adapter-vercel";
import { sql } from "drizzle-orm";
import type { RequestHandler } from "./$types";

/**
 * Keeps the *other* page function warm. The adapter bundles routes by their
 * `config`: the Idea Recorder, the project and song pages and the ready/mix
 * endpoints declare `maxDuration: 300` and so share a function of their own,
 * which `/api/warm` (in the default function) never reaches. This route
 * declares the same config, lands in that function, and the cron
 * (vercel.json) calls it every five minutes too (docs/environment.md
 * "Cold starts"). Public and harmless: it answers nothing but "ok".
 */
export const config: Config = { maxDuration: 300 };

export const GET: RequestHandler = async () => {
	await db.run(sql`select 1`);
	return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
};
