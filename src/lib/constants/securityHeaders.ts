/**
 * Response headers every page and API response carries, set in
 * src/hooks.server.ts; vercel.json repeats them for the static files the
 * CDN serves without reaching the app (keep the two in step). Search
 * engines get only the front page: every other path carries
 * ROBOTS_NOINDEX (the hook and vercel.json's `/(.+)` rule) and a robots
 * meta from the root layout, and static/robots.txt allows `/` alone. The
 * Content-Security-Policy itself comes from SvelteKit's `csp` option in
 * vite.config.ts so its inline script gets a nonce. Modelled on
 * lightning-jar/lj-website's vercel.ts.
 */
/** The X-Robots-Tag / robots meta value for everything but the front page. */
export const ROBOTS_NOINDEX = "noindex, nofollow, noarchive";

export const SECURITY_HEADERS: Record<string, string> = {
	"x-content-type-options": "nosniff",
	"x-frame-options": "DENY",
	"referrer-policy": "strict-origin-when-cross-origin",
	"cross-origin-opener-policy": "same-origin",
	"strict-transport-security": "max-age=31536000; includeSubDomains; preload",
	// Nothing here uses device APIs; playback needs no feature, so `autoplay`
	// is left out rather than switched off (it would block play() too).
	"permissions-policy":
		"accelerometer=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), publickey-credentials-get=(), screen-wake-lock=(), serial=(), usb=(), xr-spatial-tracking=(), hid=(), idle-detection=()",
};
