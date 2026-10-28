/**
 * Every route under src/routes, with the URL that exercises it and the
 * statuses it answers signed out and as the Screenshot Bot, shared by the
 * smoke test (scripts/smoke-urls.mjs) and the indexability audit
 * (scripts/seo-audit.ts) so both see one list. Every route file must have a
 * row here (`missingRoutes`), or both scripts fail, so a new route joins
 * them the day it is written. Dynamic segments are filled from the
 * database (`loadSegments`, `fillUrl`); token routes get a made-up token.
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@libsql/client";

const BOT_EMAIL = "screenshot-bot@stem-shovel.com";
const BAD_TOKEN = "A".repeat(32);

/**
 * One route file → the URL to hit and the statuses each pass accepts: an
 * array, or a function of the segments `loadSegments` fetched.
 */
export const ROUTES = [
	// route (as under src/routes), url, anonymous statuses, bot statuses
	["", "/", [200], [200]],
	["accounts", "/accounts", [303], [200]],
	["[account]/projects", "/{account}/projects", [200], [200]],
	["[account]/projects/[project]", "/{account}/projects/{project}", [200], [200]],
	["[account]/projects/[project]/[song]", "/{account}/projects/{project}/{song}", [200], [200]],
	[
		"[account]/projects/[project]/[song]/mixes/[mix]",
		"/{account}/projects/{project}/{song}/mixes/nope",
		[404],
		[404],
	],
	[
		"[account]/projects/[project]/[song]/[doc=songDoc]",
		"/{account}/projects/{project}/{song}/chart",
		[303],
		[200],
	],
	["[account]/ideas", "/{account}/ideas", [303], [303]],
	["[account]/ideas/recorder", "/{account}/ideas/recorder", [303], [303]],
	["idea-recorder", "/idea-recorder", [303], [200]],
	// The old address: a permanent redirect for everyone (vercel.json on a deployment, 308; src/routes/ideas/recorder/+server.ts on dev, 301).
	["ideas/recorder (server)", "/ideas/recorder", [301, 308], [301, 308]],
	["looper", "/looper", [200], [200]],
	["practice-amp", "/practice-amp", [200], [200]],
	["multitrack-recorder", "/multitrack-recorder", [200], [200]],
	["multitrack-recorder/features", "/multitrack-recorder/features", [200], [200]],
	// The old address: a permanent redirect for everyone (vercel.json on a deployment, 308; src/routes/studio/+server.ts on dev, 301).
	["studio (server)", "/studio", [301, 308], [301, 308]],
	["[account]/settings", "/{account}/settings", [303], [200]],
	["[account]/artists", "/{account}/artists", [303], [200]],
	["projects", "/projects", [303], [200]],
	["sessions", "/sessions", [303], [200]],
	["songs", "/songs", [303], [200]],
	["[account]/sessions", "/{account}/sessions", [303], [200]],
	["[account]/sessions/record", "/{account}/sessions/record", [303], [200]],
	// A recording's own page: a member's, or a share link's; nobody else (an id nobody has: 404 either way).
	["[account]/sessions/r/[recording]", "/{account}/sessions/r/x", [404], [404]],
	// A whole session's own page: a member's, or the session's share link's; nobody else (an id nobody has: 404 either way).
	["[account]/sessions/s/[session]", "/{account}/sessions/s/x", [404], [404]],
	["[account]/set-lists", "/{account}/set-lists", [303], [200]],
	// A set list's editor (members) and its show view (members, or its viewing link's); an id nobody has: 404 either way.
	["[account]/set-lists/[id]", "/{account}/set-lists/x", [404], [404]],
	["[account]/set-lists/[id]/show", "/{account}/set-lists/x/show", [404], [404]],
	["[account]/shows", "/{account}/shows", [303], [200]],
	["[account]/practices", "/{account}/practices", [303], [200]],
	// An event's own page (a show or a practice); an id nobody has: 404 either way.
	["[account]/events/[id]", "/{account}/events/x", [303], [404]],
	["[account]/artists/[id]", "/{account}/artists/x", [303], [404]],
	["admin/accounts", "/admin/accounts", [404], [200]],
	["admin/ai-requests", "/admin/ai-requests", [404], [200]],
	["admin/audit-log", "/admin/audit-log", [404], [200]],
	["admin/bug-reports", "/admin/bug-reports", [404], [200]],
	["admin/feature-requests", "/admin/feature-requests", [404], [200]],
	["admin/home", "/admin/home", [404], [200]],
	["admin/drum-kits", "/admin/drum-kits", [404], [200]],
	["admin/invite-codes", "/admin/invite-codes", [404], [200]],
	["admin/playback", "/admin/playback", [404], [200]],
	["admin/users", "/admin/users", [404], [200]],
	["admin/users/[id]", "/admin/users/x", [404], [404]],
	["admin/support-requests", "/admin/support-requests", [404], [200]],
	["admin/waitlist", "/admin/waitlist", [404], [200]],
	["admin/sign-up", "/admin/sign-up", [404], [200]],
	["docs", "/docs", [200], [200]],
	["releases", "/releases", [200], [200]],
	["support", "/support", [200], [200]],
	["tuner", "/tuner", [200], [200]],
	["metronome", "/metronome", [200], [200]],
	["drum-machine", "/drum-machine", [200], [200]],
	["piano", "/piano", [200], [200]],
	["chord-player", "/chord-player", [200], [200]],
	["convert", "/convert", [200], [200]],
	["pricing", "/pricing", [200], [200]],
	["blog", "/blog", [200], [200]],
	["built-with", "/built-with", [200], [200]],
	// The newest published post, or a 404 on a stage with none yet (an array of expectations, or a function of the fetched rows).
	["blog/[slug]", "/blog/{post}", (s) => (s.post ? [200] : [404]), (s) => (s.post ? [200] : [404])],
	["blog/[slug]/edit", "/blog/{post}/edit", [401, 403, 404], (s) => (s.post ? [200] : [404])],
	["feature-requests", "/feature-requests", [200], [200]],
	["docs/[slug]", "/docs/{doc}", [200], [200]],
	["docs/[slug]/edit", "/docs/{doc}/edit", [401, 403, 404], [200]],
	["forgot-password", "/forgot-password", [200], [200, 303]],
	["invite/[token]", `/invite/${BAD_TOKEN}`, [200], [200]],
	["reset-password", "/reset-password", [200], [200, 303]],
	["settings/security", "/settings/security", [401], [200]],
	["settings/notifications", "/settings/notifications", [303], [200]],
	["settings/links", "/settings/links", [303], [200]],
	["inbox", "/inbox", [303], [200]],
	["dashboard", "/dashboard", [303], [200]],
	["api/notifications/digest (server)", "/api/notifications/digest", [200], [200]],
	["sign-in", "/sign-in", [200], [303]],
	["sign-up", "/sign-up", [200], [200, 303]],
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
	// Documentation downloads build in the request; a nonsense id is a 404 either way.
	["api/songs/[id]/documentation.pdf (server)", "/api/songs/x/documentation.pdf", [404], [404]],
	[
		"api/projects/[id]/documentation.zip (server)",
		"/api/projects/x/documentation.zip",
		[404],
		[404],
	],
	["api/projects/[id]/charts.zip (server)", "/api/projects/x/charts.zip", [404], [404]],
	["api/demos (server)", "/api/demos", [405], [405]],
	["api/sessions (server)", "/api/sessions", [405], [405]],
	["api/sessions/[id]/ready (server)", "/api/sessions/x/ready", [405], [405]],
	["api/sessions/[id]/eq.mp3 (server)", "/api/sessions/x/eq.mp3", [401], [404]],
	// A visitor with the session's share code may fetch it, so an unknown session is a 404 either way.
	[
		"api/recording-sessions/[id]/mp3.zip (server)",
		"/api/recording-sessions/x/mp3.zip",
		[404],
		[404],
	],
	["api/demos/[id]/ready (server)", "/api/demos/x/ready", [405], [405]],
	["api/mixes (server)", "/api/mixes", [405], [405]],
	["api/mixes/[id]/ready (server)", "/api/mixes/x/ready", [405], [405]],
	["api/files (server)", "/api/files", [405], [405]],
	["api/files/[id]/ready (server)", "/api/files/x/ready", [405], [405]],
	["api/notation (server)", "/api/notation", [405], [405]],
	["api/notation/[id]/ready (server)", "/api/notation/x/ready", [405], [405]],
	["f/[code] (server)", "/f/x", [404], [404]],
	// A short link nobody made is a 404 (an unknown code, and a code outside the alphabet).
	["x/[code] (server)", "/x/AbCd2345", [404], [404]],
	["api/drum-samples (server)", "/api/drum-samples", [405], [405]],
	["api/drum-samples/[id]/ready (server)", "/api/drum-samples/x/ready", [405], [405]],
	["api/recordings (server)", "/api/recordings", [405], [405]],
	["robots.txt (server)", "/robots.txt", [200], [200]],
	["sitemap.xml (server)", "/sitemap.xml", [200], [200]],
	["api/warm (server)", "/api/warm", [200], [200]],
	["api/warm/long (server)", "/api/warm/long", [200], [200]],
	["api/jobs (server)", "/api/jobs", [405], [405]],
	["api/recordings/[id]/ready (server)", "/api/recordings/x/ready", [405], [405]],
	["api/recordings/[id]/stems (server)", "/api/recordings/x/stems", [405], [405]],
	["api/recording-stems/[id]/ready (server)", "/api/recording-stems/x/ready", [405], [405]],
	["api/studio/sources (server)", "/api/studio/sources", [405], [405]],
	["api/studio/sources/[id]/ready (server)", "/api/studio/sources/x/ready", [405], [405]],
	["api/stems (server)", "/api/stems", [405], [405]],
	["api/stems/[id]/ready (server)", "/api/stems/x/ready", [405], [405]],
	["api/stems/[id]/replace (server)", "/api/stems/x/replace", [405], [405]],
	["api/stems/[id]/midi (server)", "/api/stems/x/midi", [405], [405]],
	["api/stems/[id]/midi/ready (server)", "/api/stems/x/midi/ready", [405], [405]],
	["api/upload (server)", "/api/upload", [405], [405]],
];

/**
 * Routes the indexability audit (scripts/seo-audit.ts) reports as an
 * exception instead of a finding, with why: route (as in ROUTES) → note.
 * A check is named after the colon to except one check only
 * ("route:check"); a bare route excepts every check on it.
 */
export const SEO_EXPECTATIONS = {
	// vercel.json's own redirects answer before any header rule; a crawler follows a 308 to the
	// new address, which carries the noindex itself, so a header on the redirect would add nothing.
	"studio (server):header": "a vercel.json redirect; the new address carries noindex",
	"ideas/recorder (server):header": "a vercel.json redirect; the new address carries noindex",
	// vercel.json's rule exempts every /docs… and /blog… path; it covers static files only, and the
	// editors are never static, so the hook's noindex header and the layout's meta are what count.
	"docs/[slug]/edit:vercel": "the hook sets noindex; vercel.json's rule is for static files",
	"blog/[slug]/edit:vercel": "the hook sets noindex; vercel.json's rule is for static files",
};

/** Every route file under `dir`: a page as its directory, an endpoint as "<dir> (server)". */
export function routeFiles(dir, prefix = "") {
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

/** The route files with no row in ROUTES. */
export function missingRoutes(dir = "src/routes") {
	const known = new Set(ROUTES.map((r) => r[0]));
	return routeFiles(dir).filter((r) => !known.has(r));
}

/**
 * The values for dynamic segments, from the database in the environment:
 * an account the bot belongs to (or the oldest), its first public project
 * and song with a mix, the first user doc and the newest published post
 * (undefined on a stage with none).
 */
export async function loadSegments() {
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
	const [doc] = await q(
		"select slug from user_doc where kind = 'doc' order by sort_order asc limit 1",
	);
	const [post] = await q(
		"select slug from user_doc where kind = 'post' and published_at is not null order by published_at desc limit 1",
	);
	return { acct, proj, song, doc, post };
}

/** A ROUTES url with its {placeholders} filled from `loadSegments`. */
export const fillUrl = (url, s) =>
	url
		.replace("{account}", s.acct.slug)
		.replace("{project}", s.proj.slug)
		.replace("{song}", s.song.slug)
		.replace("{songId}", s.song.id)
		.replace("{doc}", s.doc.slug)
		.replace("{post}", s.post?.slug ?? "no-post-yet");
