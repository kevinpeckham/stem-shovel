import * as v from "valibot";
import { isSafeShortTarget } from "../utils/isSafeShortTarget";

/**
 * A short link (`short_link`): a code that stands for a page on the app,
 * query and hash included, so the instruments' long share links fit in a
 * message. Minted by anyone (the instruments work signed out); resolved
 * at `/x/<code>` and on the short domain (docs/security.md, "Short links").
 */
export const SHORT_LINK_KINDS = [
	"chord-player",
	"drum-machine",
	"piano",
	"song",
	"project",
	"other",
] as const;
export type ShortLinkKind = (typeof SHORT_LINK_KINDS)[number];

/** No 0/O, 1/l/I: a code read aloud or typed from paper comes out right. */
export const SHORT_LINK_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export const SHORT_LINK_CODE_LENGTH = 8;
/** A target is a path with its query and hash; the chord player's settings ride in the hash. */
export const SHORT_LINK_MAX_TARGET = 4000;
/** Days an anonymous link lives; a signed-in user's never expires. */
export const SHORT_LINK_ANONYMOUS_DAYS = 90;

const codePattern = new RegExp(`^[${SHORT_LINK_ALPHABET}]{${SHORT_LINK_CODE_LENGTH}}$`);

/** The code in a short link's address. */
export const ShortLinkCodeSchema = v.pipe(
	v.string(),
	v.regex(codePattern, "Not a short link code."),
);

/** What the client asks to shorten: a same-origin path (the client strips the origin) and what it points at. */
export const ShortLinkMintSchema = v.object({
	target: v.pipe(
		v.string(),
		v.maxLength(SHORT_LINK_MAX_TARGET, "That address is too long to shorten."),
		v.check(isSafeShortTarget, "A short link points at a page on this site."),
	),
	kind: v.picklist(SHORT_LINK_KINDS, "Not a kind of short link."),
});

export type ShortLinkMint = v.InferOutput<typeof ShortLinkMintSchema>;
export type ShortLinkCode = v.InferOutput<typeof ShortLinkCodeSchema>;
