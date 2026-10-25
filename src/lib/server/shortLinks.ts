import { background } from "#lib/server/background.js";
import { db } from "#lib/server/db/index.js";
import { shortLink } from "#lib/server/db/schema/index.js";
import {
	SHORT_LINK_ALPHABET,
	SHORT_LINK_ANONYMOUS_DAYS,
	SHORT_LINK_CODE_LENGTH,
	ShortLinkAddressSchema,
	type ShortLinkKind,
} from "#lib/val/ShortLinkSchema.js";
import { and, desc, eq, gt, isNull, lt, ne, sql } from "drizzle-orm";
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
 * same user shortening the same target gets the code they already have
 * (found by target, so a link given a custom address is still the one); an
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
 * The target of a live address, counting the arrival after the response
 * (never in its way: a failed count is logged, the redirect still goes);
 * null for an address nobody made, one that is malformed, or one that has
 * expired. A random code is case-sensitive and matched exactly; a custom
 * address may arrive capitalized, so after an exact miss the lowered form
 * is tried (custom addresses are saved lowercase).
 */
export async function resolveShortLink(
	address: string,
	now = Date.now(),
): Promise<{ target: string } | null> {
	if (!v.is(ShortLinkAddressSchema, address)) return null;
	const find = (code: string) =>
		db.query.shortLink.findFirst({
			where: eq(shortLink.code, code),
			columns: { id: true, target: true, expiresAt: true },
		});
	const lower = address.toLowerCase();
	const row = (await find(address)) ?? (lower !== address ? await find(lower) : undefined);
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

/** The links a user made, newest first (/settings/links). */
export async function listShortLinksOf(userId: string) {
	return db.query.shortLink.findMany({
		where: eq(shortLink.createdBy, userId),
		orderBy: [desc(shortLink.createdAt)],
		columns: {
			id: true,
			code: true,
			target: true,
			kind: true,
			hits: true,
			lastHitAt: true,
			expiresAt: true,
			createdAt: true,
		},
	});
}

/** Whose link it is: missing, someone else's, or the user's own. */
async function ownership(linkId: string, userId: string): Promise<"missing" | "forbidden" | "own"> {
	const row = await db.query.shortLink.findFirst({
		where: eq(shortLink.id, linkId),
		columns: { createdBy: true },
	});
	if (!row) return "missing";
	return row.createdBy === userId ? "own" : "forbidden";
}

/** Deletes one of the user's links; the address stops working at once. Only its creator may. */
export async function revokeShortLink(
	linkId: string,
	userId: string,
): Promise<"revoked" | "missing" | "forbidden"> {
	const owner = await ownership(linkId, userId);
	if (owner !== "own") return owner;
	await db.delete(shortLink).where(and(eq(shortLink.id, linkId), eq(shortLink.createdBy, userId)));
	return "revoked";
}

/**
 * Gives one of the user's links a custom address (already checked by
 * `ShortLinkSlugSchema`): the code column becomes the slug, so the old
 * address stops working. "taken" when another link holds it, found first or
 * caught as the unique index's violation in a race. Only its creator may.
 */
export async function setShortLinkSlug(
	linkId: string,
	userId: string,
	slug: string,
): Promise<"saved" | "taken" | "missing" | "forbidden"> {
	const owner = await ownership(linkId, userId);
	if (owner !== "own") return owner;
	const holder = await db.query.shortLink.findFirst({
		where: and(eq(shortLink.code, slug), ne(shortLink.id, linkId)),
		columns: { id: true },
	});
	if (holder) return "taken";
	try {
		await db
			.update(shortLink)
			.set({ code: slug })
			.where(and(eq(shortLink.id, linkId), eq(shortLink.createdBy, userId)));
	} catch (e) {
		if (isCodeCollision(e)) return "taken";
		throw e;
	}
	return "saved";
}

/** Removes the anonymous links past their day (the daily cron, /api/notifications/digest); answers how many went. */
export async function purgeExpiredShortLinks(now = new Date()): Promise<number> {
	const gone = await db
		.delete(shortLink)
		.where(lt(shortLink.expiresAt, now))
		.returning({ id: shortLink.id });
	return gone.length;
}
