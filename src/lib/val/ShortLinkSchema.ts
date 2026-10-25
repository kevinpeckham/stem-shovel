import * as v from "valibot";
import { isSafeShortTarget } from "../utils/isSafeShortTarget";
import { NanoIdSchema } from "./NanoIdSchema";

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
	"practice-amp",
	"song",
	"project",
	"studio",
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

/** A custom address's length: short enough to say, long enough not to be a random code's sibling. */
export const SHORT_LINK_SLUG_MIN = 3;
export const SHORT_LINK_SLUG_MAX = 32;
/** Lowercase letters, digits and hyphens, a letter or digit at each end. */
const slugPattern = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;

/**
 * Words a custom address may not be: the short domain's own paths (`x`),
 * the app's (`s`, `f`, `go`), names that read as the site's, and every
 * first segment of src/routes, so `shvl.me/piano` is never someone's link
 * standing in for the page itself. ShortLinkSchema.test.ts checks the
 * route list against the tree.
 */
export const SHORT_LINK_RESERVED_SLUGS: readonly string[] = [
	"x",
	"s",
	"f",
	"go",
	"api",
	"admin",
	"www",
	"app",
	"help",
	"docs",
	"sign-in",
	"sign-up",
	"settings",
	"accounts",
	"blog",
	"built-with",
	"chord-player",
	"convert",
	"drum-machine",
	"feature-requests",
	"forgot-password",
	"idea-recorder",
	"ideas",
	"inbox",
	"invite",
	"looper",
	"metronome",
	"multitrack-recorder",
	"piano",
	"practice-amp",
	"pricing",
	"projects",
	"releases",
	"reset-password",
	"sessions",
	"studio",
	"support",
	"tuner",
	"verify-2fa",
	"verify-email",
	"waitlist",
];

/**
 * A custom address a signed-in user gives one of their links in place of
 * the random code (`shvl.me/<slug>`). Typed capitals are lowered and the
 * ends trimmed before the checks, so "My-Band" saves as "my-band".
 */
export const ShortLinkSlugSchema = v.pipe(
	v.string(),
	v.trim(),
	v.toLowerCase(),
	v.minLength(SHORT_LINK_SLUG_MIN, `At least ${SHORT_LINK_SLUG_MIN} characters.`),
	v.maxLength(SHORT_LINK_SLUG_MAX, `At most ${SHORT_LINK_SLUG_MAX} characters.`),
	v.regex(
		slugPattern,
		"Lowercase letters, digits and hyphens, starting and ending with a letter or digit.",
	),
	v.check((slug) => !SHORT_LINK_RESERVED_SLUGS.includes(slug), "That address is reserved."),
);

/**
 * What a short address carries: a random code (case-sensitive) or a custom
 * address in any case (a person may type it capitalized; the lookup lowers
 * it after an exact miss). A reserved word is neither, unless it happens to
 * be a code's exact shape.
 */
export const ShortLinkAddressSchema = v.union([
	ShortLinkCodeSchema,
	v.pipe(
		v.string(),
		v.regex(new RegExp(slugPattern.source, "i")),
		v.check((s) => !SHORT_LINK_RESERVED_SLUGS.includes(s.toLowerCase())),
	),
]);

/** The links page's Custom address form: one of the user's links, and the address it should have. */
export const ShortLinkSlugFormSchema = v.object({
	linkId: NanoIdSchema,
	slug: ShortLinkSlugSchema,
});

/** Revoke: one of the user's links. */
export const ShortLinkIdSchema = v.object({ id: NanoIdSchema });

export type ShortLinkMint = v.InferOutput<typeof ShortLinkMintSchema>;
export type ShortLinkCode = v.InferOutput<typeof ShortLinkCodeSchema>;
export type ShortLinkSlugForm = v.InferOutput<typeof ShortLinkSlugFormSchema>;
