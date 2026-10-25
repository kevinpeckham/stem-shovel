import { command, form, getRequestEvent } from "$app/server";
import { requireUser } from "#lib/server/access.js";
import { MINUTE, rateLimited } from "#lib/server/rateLimit.js";
import {
	mintShortLink as mint,
	revokeShortLink as revoke,
	setShortLinkSlug as setSlug,
} from "#lib/server/shortLinks.js";
import { shortLinkUrl } from "#lib/utils/shortLinkUrl.js";
import {
	ShortLinkIdSchema,
	ShortLinkMintSchema,
	ShortLinkSlugFormSchema,
} from "#lib/val/ShortLinkSchema.js";
import { error, invalid } from "@sveltejs/kit";
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

/** Deletes one of the signed-in user's links (/settings/links); someone else's is a 403. */
export const revokeShortLink = command(ShortLinkIdSchema, async ({ id }) => {
	const user = requireUser(getRequestEvent().locals);
	const result = await revoke(id, user.id);
	if (result === "missing") error(404, "That link is already gone.");
	if (result === "forbidden") error(403, "Only the person who made a link can revoke it.");
	return { revoked: id };
});

/**
 * A custom address for one of the signed-in user's links (/settings/links):
 * the schema lowers it and refuses the pattern and the reserved words; a
 * taken one goes back to the field. 30 changes in ten minutes per user, so
 * nobody walks the namespace looking for free names.
 */
export const setShortLinkSlug = form(ShortLinkSlugFormSchema, async ({ linkId, slug }, issue) => {
	const user = requireUser(getRequestEvent().locals);
	if (await rateLimited(`short-link-slug:user:${user.id}`, 30, 10 * MINUTE))
		error(429, "That is a lot of address changes; try again in a few minutes.");
	const result = await setSlug(linkId, user.id, slug);
	if (result === "missing") error(404, "That link is gone.");
	if (result === "forbidden") error(403, "Only the person who made a link can change its address.");
	if (result === "taken") invalid(issue.slug("Another link already has that address."));
	return { slug };
});
