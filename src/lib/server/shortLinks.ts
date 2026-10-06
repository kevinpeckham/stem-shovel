import { background } from "$lib/server/background";
import { db } from "$lib/server/db";
import { shortLink } from "$lib/server/db/schema";
import {
	SHORT_LINK_ALPHABET,
	SHORT_LINK_ANONYMOUS_DAYS,
	SHORT_LINK_CODE_LENGTH,
	ShortLinkCodeSchema,
	type ShortLinkKind,
} from "$lib/val/ShortLinkSchema";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import * as v from "valibot";

/**
 * Short links (`short_link`, docs/security.md "Short links"): a code for a
 * page on the app with its query and hash. The target is always a path on
 * this site (`ShortLinkMintSchema` checks it), so a code can never send a
 * visitor anywhere else. Minting is open to anyone; the remote function
 * rate-limits it.
 */

const newCode = customAlphabet(SHORT_LINK_ALPHABET, SHORT_LINK_CODE_LENGTH);
const DAY = 86_400_000;
/** Collisions are one in 57^8 per draw; a handful of retries is more than enough. */
const CODE_ATTEMPTS = 5;

export interface ShortLinkMintInput {
	target: string;
	kind: ShortLinkKind;
	userId: string | null;
	accountId: string | null;
}

/**
 * A code for the target. A signed-in user's link never expires, and the
 * same user shortening the same target gets the code they already have; an
 * anonymous link lives `SHORT_LINK_ANONYMOUS_DAYS`, and the same anonymous
 * target within a day reuses the day's code (a share button pressed twice
 * is one row). A new code that collides with an existing one is drawn
 * again.
 */
export async function mintShortLink(
	{ target, kind, userId, accountId }: ShortLinkMintInput,
	now = Date.now(),
): Promise<{ code: string; expiresAt: Date | null }> {
	const existing = await db.query.shortLink.findFirst({
		where: userId
			? and(eq(shortLink.createdBy, userId), eq(shortLink.target, target))
			: and(
					isNull(shortLink.createdBy),
					eq(shortLink.target, target),
					gt(shortLink.createdAt, new Date(now - DAY)),
				),
		columns: { code: true, expiresAt: true },
	});
	if (existing) return existing;
	const expiresAt = userId ? null : new Date(now + SHORT_LINK_ANONYMOUS_DAYS * DAY);
	for (let attempt = 1; ; attempt++) {
		const code = newCode();
		try {
			await db
				.insert(shortLink)
				.values({ code, target, kind, createdBy: userId, accountId, expiresAt });
			return { code, expiresAt };
		} catch (e) {
			if (!isCodeCollision(e) || attempt >= CODE_ATTEMPTS) throw e;
		}
	}
}

/** libsql reports a unique index violation in the error message. */
function isCodeCollision(e: unknown): boolean {
	const message = e instanceof Error ? e.message : String(e);
	return /UNIQUE constraint failed/i.test(message);
}

/**
 * The target of a live code, counting the arrival after the response
 * (never in its way: a failed count is logged, the redirect still goes);
 * null for a code nobody made, one that is malformed, or one that has
 * expired.
 */
export async function resolveShortLink(
	code: string,
	now = Date.now(),
): Promise<{ target: string } | null> {
	if (!v.is(ShortLinkCodeSchema, code)) return null;
	const row = await db.query.shortLink.findFirst({
		where: eq(shortLink.code, code),
		columns: { id: true, target: true, expiresAt: true },
	});
	if (!row) return null;
	if (row.expiresAt && row.expiresAt.getTime() < now) return null;
	background(async () => {
		await db
			.update(shortLink)
			.set({ hits: sql`${shortLink.hits} + 1`, lastHitAt: new Date(now) })
			.where(eq(shortLink.id, row.id));
	});
	return { target: row.target };
}

/** Removes the anonymous links past their day (the daily cron, /api/notifications/digest); answers how many went. */
export async function purgeExpiredShortLinks(now = new Date()): Promise<number> {
	const gone = await db
		.delete(shortLink)
		.where(lt(shortLink.expiresAt, now))
		.returning({ id: shortLink.id });
	return gone.length;
}
