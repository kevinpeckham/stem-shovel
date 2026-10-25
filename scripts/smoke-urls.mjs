/**
 * Smoke test: every route answers as expected, signed out and as the
 * Screenshot Bot (a member of an account, system and super admin), against
 * the dev server or production.
 *
 *   bun run smoke:urls                                   # dev server, both passes
 *   SMOKE_BASE=https://staging.stemshovel.dev bun run smoke:urls  # staging (bot pass once its token is there)
 *   SMOKE_BASE=https://www.stemshovel.com bun run smoke:urls   # production (anonymous pass only)
 *
 * Dynamic segments are filled from the database (an account the bot
 * belongs to, its first project and song, a user doc); token routes get a
 * made-up token and must answer with their "not valid" page. The bot pass
 * needs PREVIEW_AUTH_TOKEN in the environment (docs/agent-screenshots.md);
 * without it the script runs the signed-out pass alone. Every route under
 * src/routes must have a row in scripts/lib/siteRoutes.mjs (shared with the
 * indexability audit), or the script fails, so a new route is
 * added to the smoke test the day it is written. Production's bot
 * protection is bypassed for the dev VM's address by a firewall rule
 * (docs/security.md); from elsewhere, expect challenges.
 */
import { fillUrl, loadSegments, missingRoutes, ROUTES } from "./lib/siteRoutes.mjs";

const base = (process.env.SMOKE_BASE ?? "http://localhost:5173").replace(/\/$/, "");
const token = process.env.PREVIEW_AUTH_TOKEN ?? "";

// ---- what to test ------------------------------------------------------------

/** Not routes, but must serve. */
const STATIC = [
	["/robots.txt", [200]],
	["/lj-icon.svg", [200]],
	["/no-such-page-" + Date.now(), [404]],
];
/**
 * Any of these in an HTML body is a failure regardless of status. The error
 * wordings are matched as rendered text between tags, so a page that merely
 * mentions them in prose (the releases page quoting an old fix) passes.
 */
const BAD_BODY = [
	"Vercel Security Checkpoint",
	">Internal Error<",
	">Error 500<",
	">Something went wrong<",
];

// ---- every route file must be listed ------------------------------------------

const missing = missingRoutes();
if (missing.length) {
	console.error(
		"Routes with no smoke-test row (add them to scripts/lib/siteRoutes.mjs):\n  " +
			missing.join("\n  "),
	);
	process.exit(2);
}

// ---- the values for dynamic segments -------------------------------------------

const segments = await loadSegments();
const fill = (url) => fillUrl(url, segments);

// ---- run --------------------------------------------------------------------------

async function probe(url, headers) {
	const started = Date.now();
	const res = await fetch(base + url, { headers, redirect: "manual" });
	const type = res.headers.get("content-type") ?? "";
	const body = type.includes("text/html") ? await res.text() : "";
	const bad = BAD_BODY.find((b) => body.includes(b));
	return {
		status: res.status,
		ms: Date.now() - started,
		bad,
		location: res.headers.get("location"),
	};
}
/** The note after a result: a bad body's phrase, or where a redirect points. */
function noteOf(r) {
	if (r.bad) return `  body: ${r.bad}`;
	return r.location ? `  → ${r.location.replace(base, "")}` : "";
}
/** One URL: probe it, print its line, and say whether it passed. */
async function check(url, ok, headers) {
	const target = fill(url);
	const r = await probe(target, headers).catch((e) => ({
		status: 0,
		ms: 0,
		bad: String(e).slice(0, 80),
	}));
	const good = ok.includes(r.status) && !r.bad;
	console.log(
		`  ${good ? "ok " : "FAIL"} ${String(r.status).padStart(3)} ${String(r.ms).padStart(5)}ms  ${target}${good ? "" : `  (wanted ${ok.join("/")})`}${noteOf(r)}`,
	);
	return good;
}
async function pass(name, headers, pick) {
	let failed = 0;
	console.log(`\n${name}  (${base})`);
	const checks = [...ROUTES.map((r) => [r[1], pick(r)]), ...STATIC].map(([url, ok]) => [
		url,
		typeof ok === "function" ? ok(segments) : ok,
	]);
	for (const [url, ok] of checks) if (!(await check(url, ok, headers))) failed++;
	return failed;
}

let failures = await pass("signed out", {}, (r) => r[2]);
// The bot pass runs only where the token is recognised (production keeps it
// out of 1Password on purpose, so there the test is signed-out only).
const botHeaders = { "x-preview-token": token };
const recognised = token && (await probe("/accounts", botHeaders)).status === 200;
if (recognised) failures += await pass("as the Screenshot Bot", botHeaders, (r) => r[3]);
else
	console.log(
		`\n(signed-in pass skipped: ${token ? "this server does not recognise PREVIEW_AUTH_TOKEN" : "no PREVIEW_AUTH_TOKEN"})`,
	);
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
