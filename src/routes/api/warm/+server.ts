import { db } from "$lib/server/db";
import { sql } from "drizzle-orm";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/**
 * Keeps the page function warm: a Vercel cron (vercel.json) calls this every
 * five minutes on production, so the first visitor of the hour does not pay
 * a five-second cold start (docs/environment.md "Cold starts"). One round
 * trip to the database warms that path too. Public and harmless: it answers
 * nothing but "ok".
 */
export const GET: RequestHandler = async () => {
	await db.run(sql`select 1`);
	return json({ ok: true }, { headers: { "cache-control": "no-store" } });
};
