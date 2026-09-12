import { db, schema } from "$lib/server/db";
import { eq } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { ENV } from "varlock/env";

/**
 * Screenshot / preview auth bypass, ported from replicator.
 *
 * A request carrying the exact `PREVIEW_AUTH_TOKEN` (header `x-preview-token`
 * or cookie `preview_token`) is treated as the "Screenshot Bot" user, so
 * `bun run shot` can capture members-only pages and the editing controls
 * without a real sign-in. The bot is an ordinary user row; which accounts it
 * may edit is decided by its `account_member` rows (`bun run db:preview-bot
 * <account-slug>` adds one), never by the token.
 *
 * SECURITY — this is a real auth bypass and works wherever the token is set
 * (dev and prod share one database), so the token is the credential:
 * - Fail-closed: an unset, empty or short (< 32 chars) token disables the
 *   bypass entirely. Leave it out of 1Password to keep production closed.
 * - Constant-time comparison; neither value is ever logged.
 * - Never creates the bot user here: `db:preview-bot` does that, so a leaked
 *   token cannot mint identities.
 */

export const PREVIEW_TOKEN_HEADER = "x-preview-token";
export const PREVIEW_TOKEN_COOKIE = "preview_token";
export const BOT_EMAIL = "screenshot-bot@stem-shovel.com";
export const BOT_NAME = "Screenshot Bot";

const MIN_TOKEN_LENGTH = 32;

/** True only when the bypass is enabled and `provided` matches exactly. */
export function isValidPreviewToken(provided: string | null | undefined): boolean {
	const expected = ENV.PREVIEW_AUTH_TOKEN ?? "";
	if (typeof expected !== "string" || expected.length < MIN_TOKEN_LENGTH) return false;
	if (typeof provided !== "string" || provided.length === 0) return false;
	const a = Buffer.from(provided, "utf8");
	const b = Buffer.from(expected, "utf8");
	if (a.length !== b.length) return false;
	try {
		return timingSafeEqual(a, b);
	} catch {
		return false;
	}
}

/**
 * The bot user when the request carries a valid token, else null. The bot's
 * memberships are then loaded by the hook exactly like any user's.
 */
export async function resolvePreviewAuth(event: {
	request: { headers: Headers };
	cookies: { get: (name: string) => string | undefined };
}): Promise<App.Locals["user"]> {
	const provided =
		event.request.headers.get(PREVIEW_TOKEN_HEADER) ??
		event.cookies.get(PREVIEW_TOKEN_COOKIE) ??
		null;
	if (!isValidPreviewToken(provided)) return null;
	const bot = await db.query.user.findFirst({
		where: eq(schema.user.email, BOT_EMAIL),
		columns: { id: true, name: true, email: true, isActive: true },
	});
	if (!bot || !bot.isActive) return null;
	return { id: bot.id, name: bot.name, email: bot.email };
}
