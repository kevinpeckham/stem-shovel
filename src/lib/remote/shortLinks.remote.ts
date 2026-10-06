import { command, getRequestEvent } from "$app/server";
import { MINUTE, rateLimited } from "$lib/server/rateLimit";
import { mintShortLink as mint } from "$lib/server/shortLinks";
import { shortLinkUrl } from "$lib/utils/shortLinkUrl";
import { ShortLinkMintSchema } from "$lib/val/ShortLinkSchema";
import { error } from "@sveltejs/kit";
import { ENV } from "varlock/env";

/**
 * A short link for a page on this site (docs/security.md, "Short links").
 * Anyone may mint one, signed in or not, since the instruments work signed
 * out: the schema allows only a path on this origin, and the limiter
 * allows 30 in ten minutes per address, 120 per signed-in user. The answer
 * is the code and the address to hand out: on the short domain when the
 * stage has one (`SHORT_LINK_ORIGIN`), else `/x/<code>` here. A song's or
 * project's link is filed under its account when the minter belongs to it
 * (the first path segment is the account's slug); the instruments' are not
 * filed anywhere.
 */
export const mintShortLink = command(ShortLinkMintSchema, async ({ target, kind }) => {
	const { locals, url, getClientAddress } = getRequestEvent();
	const user = locals.user;
	const limited = user
		? await rateLimited(`short-link:user:${user.id}`, 120, 10 * MINUTE)
		: await rateLimited(`short-link:ip:${getClientAddress()}`, 30, 10 * MINUTE);
	if (limited) error(429, "That is a lot of short links; try again in a few minutes.");
	const slug = kind === "song" || kind === "project" ? target.split(/[/?#]/)[1] : undefined;
	const accountId =
		(slug && locals.memberships.find((m) => m.slug === slug && !m.actingAs)?.accountId) ?? null;
	const { code } = await mint({ target, kind, userId: user?.id ?? null, accountId });
	return { code, url: shortLinkUrl(code, ENV.SHORT_LINK_ORIGIN, url.origin) };
});
