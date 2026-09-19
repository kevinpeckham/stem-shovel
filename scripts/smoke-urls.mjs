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
 * src/routes must have a row here, or the script fails, so a new route is
 * added to the smoke test the day it is written. Production's bot
 * protection is bypassed for the dev VM's address by a firewall rule
 * (docs/security.md); from elsewhere, expect challenges.
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@libsql/client";

const base = (process.env.SMOKE_BASE ?? "http://localhost:5173").replace(/\/$/, "");
const token = process.env.PREVIEW_AUTH_TOKEN ?? "";
const BOT_EMAIL = "screenshot-bot@stem-shovel.com";
const BAD_TOKEN = "A".repeat(32);

// ---- what to test ------------------------------------------------------------

/** One route file → the URL to hit and the statuses each pass accepts. */
const ROUTES = [
	// route (as under src/routes), url, anonymous statuses, bot statuses
	["", "/", [200], [200]],
	["accounts", "/accounts", [303], [200]],
	["[account]/projects", "/{account}/projects", [200], [200]],
	["[account]/projects/[project]", "/{account}/projects/{project}", [200], [200]],
	["[account]/projects/[project]/[song]", "/{account}/projects/{project}/{song}", [200], [200]],
	[
		"[account]/projects/[project]/[song]/[doc=songDoc]",
		"/{account}/projects/{project}/{song}/chart",
		[303],
		[200],
	],
	["[account]/ideas", "/{account}/ideas", [303], [303]],
	["[account]/ideas/recorder", "/{account}/ideas/recorder", [303], [200]],
	["[account]/settings", "/{account}/settings", [303], [200]],
	["admin/accounts", "/admin/accounts", [404], [200]],
	["admin/ai-requests", "/admin/ai-requests", [404], [200]],
	["admin/audit-log", "/admin/audit-log", [404], [200]],
	["admin/bug-reports", "/admin/bug-reports", [404], [200]],
	["admin/feature-requests", "/admin/feature-requests", [404], [200]],
	["admin/home", "/admin/home", [404], [200]],
	["admin/invite-codes", "/admin/invite-codes", [404], [200]],
	["admin/users", "/admin/users", [404], [200]],
	["admin/users/[id]", "/admin/users/x", [404], [404]],
	["admin/waitlist", "/admin/waitlist", [404], [200]],
	["docs", "/docs", [200], [200]],
	["releases", "/releases", [200], [200]],
	["docs/[slug]", "/docs/{doc}", [200], [200]],
	["docs/[slug]/edit", "/docs/{doc}/edit", [401, 403, 404], [200]],
	["forgot-password", "/forgot-password", [200], [200, 303]],
	["invite/[token]", `/invite/${BAD_TOKEN}`, [200], [200]],
	["reset-password", "/reset-password", [200], [200, 303]],
	["settings/security", "/settings/security", [401], [200]],
	["sign-in", "/sign-in", [200], [303]],
	["sign-up", "/sign-up", [200], [200, 303]],
	["test", "/test", [200], [200]],
	["verify-2fa", "/verify-2fa", [200], [303]],
	["verify-email", "/verify-email", [200], [200, 303]],
	["waitlist", "/waitlist", [200], [200]],
	["waitlist/confirm/[token]", `/waitlist/confirm/${BAD_TOKEN}`, [200], [200]],
	["waitlist/manage/[token]", `/waitlist/manage/${BAD_TOKEN}`, [404], [404]],
	// API: GET where it exists; POST-only routes answer 405, which proves they are mounted.
	[
		"api/songs/[id]/mix (server)",
		"/api/songs/{songId}/mix",
		[200, 302, 303, 307, 308],
		[200, 302, 303, 307, 308],
	],
	["api/demos (server)", "/api/demos", [405], [405]],
	["api/demos/[id]/ready (server)", "/api/demos/x/ready", [405], [405]],
	["api/recordings (server)", "/api/recordings", [405], [405]],
	["robots.txt (server)", "/robots.txt", [200], [200]],
	["api/warm (server)", "/api/warm", [200], [200]],
	["api/jobs (server)", "/api/jobs", [405], [405]],
	["api/recordings/[id]/ready (server)", "/api/recordings/x/ready", [405], [405]],
	["api/stems (server)", "/api/stems", [405], [405]],
	["api/stems/[id]/ready (server)", "/api/stems/x/ready", [405], [405]],
	["api/stems/[id]/replace (server)", "/api/stems/x/replace", [405], [405]],
	["api/stems/[id]/midi (server)", "/api/stems/x/midi", [405], [405]],
	["api/stems/[id]/midi/ready (server)", "/api/stems/x/midi/ready", [405], [405]],
	["api/upload (server)", "/api/upload", [405], [405]],
];
/** Not routes, but must serve. */
const STATIC = [
	["/robots.txt", [200]],
	["/sitemap.xml", [200]],
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

function routeFiles(dir, prefix = "") {
	const out = [];
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory())
			out.push(...routeFiles(full, prefix ? `${prefix}/${name}` : name));
		else if (name === "+page.svelte") out.push(prefix);
		else if (name === "+server.ts") out.push(`${prefix} (server)`);
	}
	return out;
}
const known = new Set(ROUTES.map((r) => r[0]));
const missing = routeFiles("src/routes").filter((r) => !known.has(r));
if (missing.length) {
	console.error(
		"Routes with no smoke-test row (add them to scripts/smoke-urls.mjs):\n  " +
			missing.join("\n  "),
	);
	process.exit(2);
}

// ---- the values for dynamic segments -------------------------------------------

const db = createClient({
	// Turso's newer dashboard prints turso:// URLs; the client wants libsql:// (src/lib/utils/libsqlUrl.ts).
	url: process.env.TURSO_DATABASE_URL.replace(/^turso:\/\//i, "libsql://"),
	authToken: process.env.TURSO_AUTH_TOKEN,
});
const q = async (sql, args = []) => (await db.execute({ sql, args })).rows;
const [bot] = await q("select id from user where email = ?", [BOT_EMAIL]);
const [acct] = bot
	? await q(
			`select a.slug from account a join account_member m on m.account_id = a.id
			 where m.user_id = ? and a.status = 'active' order by a.created_at asc limit 1`,
			[bot.id],
		)
	: await q("select slug from account where status = 'active' order by created_at asc limit 1");
const [proj] = await q(
	`select p.slug from project p join account a on a.id = p.account_id
	 where a.slug = ? and p.status = 'active' and p.is_private = 0 order by p.created_at asc limit 1`,
	[acct.slug],
);
const [song] = await q(
	`select s.slug, s.id from song s join project p on p.id = s.project_id join account a on a.id = p.account_id
	 where a.slug = ? and p.slug = ? and s.status = 'active' and s.is_private = 0 and s.mix_url is not null
	 order by s.created_at asc limit 1`,
	[acct.slug, proj.slug],
);
const [doc] = await q("select slug from user_doc order by sort_order asc limit 1");
const fill = (url) =>
	url
		.replace("{account}", acct.slug)
		.replace("{project}", proj.slug)
		.replace("{song}", song.slug)
		.replace("{songId}", song.id)
		.replace("{doc}", doc.slug);

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
async function pass(name, headers, pick) {
	let failed = 0;
	console.log(`\n${name}  (${base})`);
	const checks = [...ROUTES.map((r) => [r[1], pick(r)]), ...STATIC];
	for (const [url, ok] of checks) {
		const target = fill(url);
		let r;
		try {
			r = await probe(target, headers);
		} catch (e) {
			r = { status: 0, ms: 0, bad: String(e).slice(0, 80) };
		}
		const good = ok.includes(r.status) && !r.bad;
		if (!good) failed++;
		const note = r.bad
			? `  body: ${r.bad}`
			: r.location
				? `  → ${r.location.replace(base, "")}`
				: "";
		console.log(
			`  ${good ? "ok " : "FAIL"} ${String(r.status).padStart(3)} ${String(r.ms).padStart(5)}ms  ${target}${good ? "" : `  (wanted ${ok.join("/")})`}${note}`,
		);
	}
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
