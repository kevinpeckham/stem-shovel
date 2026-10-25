/**
 * Indexability audit: for every route (the smoke test's list,
 * scripts/lib/siteRoutes.mjs) and every sitemap entry, whether it is in the
 * sitemap, allowed by robots.txt, exempt from vercel.json's X-Robots-Tag
 * rule, free of the noindex header and meta, and (public pages) has a title,
 * a description, one h1 and a lang, against what `isIndexablePath` says the
 * page is meant to be. Catches a public page that missed one of the four
 * lists (docs/security.md "Indexability audit") and app pages that leak.
 *
 *   bun run audit:seo                                        # dev server
 *   SEO_BASE=https://www.stemshovel.com bun run audit:seo    # production
 *   bun run audit:seo --report out.md --json out.json        # also write files
 *
 * Off production every page is noindex and robots.txt and the sitemap are
 * empty by design, so there the robots.txt and sitemap checks read the
 * production branch out of their route sources instead, and the header and
 * meta must say noindex everywhere. vercel.json's rule only applies on a
 * deployment; it is read from disk and tested on its own. Requests are
 * anonymous and follow no redirects (the chain is followed by hand, five
 * hops). Production's bot protection is bypassed for the dev VM's address
 * (docs/security.md); from elsewhere expect 429 challenges. A finding the
 * route means to have goes in SEO_EXPECTATIONS (siteRoutes.mjs). Exits 1
 * when there is any finding.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { isIndexablePath } from "../src/lib/utils/isIndexablePath";
import { robotsTxtAllows } from "../src/lib/utils/robotsTxtAllows";
import {
	vercelHeaderRuleMatches,
	type VercelHeaderRule,
} from "../src/lib/utils/vercelHeaderRuleMatches";
import {
	fillUrl,
	loadSegments,
	missingRoutes,
	ROUTES,
	SEO_EXPECTATIONS,
} from "./lib/siteRoutes.mjs";

const base = (process.env.SEO_BASE ?? "http://localhost:5173").replace(/\/$/, "");
const argPath = (flag: string) => {
	const i = process.argv.indexOf(flag);
	return i > 0 ? process.argv[i + 1] : undefined;
};
const exceptions = SEO_EXPECTATIONS as Record<string, string>;

interface Page {
	route: string;
	path: string;
	intent: "public" | "app";
	chain: { status: number; url: string }[];
	status: number;
	finalUrl: string;
	header: string | null;
	html: boolean;
	metaRobots: string | null;
	title: string | null;
	description: string | null;
	canonical: string | null;
	h1: number;
	lang: string | null;
	inSitemap: boolean;
	robotsTxtAllows: boolean;
	vercelRuleNoindexes: boolean;
	cells: Record<string, string>;
	absent?: boolean;
}
type Expectation = [string, string, number[] | ((s: unknown) => number[])];
interface Finding {
	route: string;
	path?: string;
	check: string;
	expected: string;
	actual: string;
	exception?: string;
}

// ---- fetching -------------------------------------------------------------------

const isRedirect = (status: number) => status >= 300 && status < 400;

/** The route's own response, and the redirect chain from it followed by hand (five hops at most). */
async function fetchChain(path: string) {
	const url = base + path;
	const first = await fetch(url, { redirect: "manual" });
	const chain = [{ status: first.status, url }];
	await follow(first, url, chain);
	const type = first.headers.get("content-type") ?? "";
	const html = first.status === 200 && type.includes("text/html");
	return { chain, header: first.headers.get("x-robots-tag"), body: html ? await first.text() : "" };
}
async function follow(res: Response, url: string, chain: { status: number; url: string }[]) {
	let location = res.headers.get("location");
	while (location && isRedirect(res.status) && chain.length < 6) {
		url = new URL(location, url).href;
		res = await fetch(url, { redirect: "manual" });
		chain.push({ status: res.status, url });
		location = res.headers.get("location");
	}
}

/** The attributes of every `<tag …>` in the html, as lower-cased name → value maps. */
function tags(html: string, tag: string) {
	return [...html.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, "gi"))].map((m) => {
		const attrs: Record<string, string> = {};
		for (const a of m[1].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))
			attrs[a[1].toLowerCase()] = a[2] ?? a[3];
		return attrs;
	});
}
/** `want` of the first tag whose `key` is `value` (or, with `any`, that has `key` at all). */
const attrOf = (
	list: Record<string, string>[],
	key: string,
	value: string,
	want: string,
	any = false,
) => list.find((t) => (any ? key in t : t[key]?.toLowerCase() === value))?.[want] ?? null;
const firstMatch = (text: string, re: RegExp) => re.exec(text)?.[1];
const decode = (s: string | null | undefined) =>
	s
		? s
				.replace(/&amp;/g, "&")
				.replace(/&quot;/g, '"')
				.replace(/&#39;/g, "'")
				.replace(/&lt;/g, "<")
				.replace(/&gt;/g, ">")
				.trim()
		: null;

function readHtml(body: string) {
	const head = body.split(/<\/head>/i)[0];
	const metas = tags(head, "meta");
	return {
		html: body.length > 0,
		metaRobots: attrOf(metas, "name", "robots", "content"),
		title: decode(firstMatch(head, /<title[^>]*>([\s\S]*?)<\/title>/i)),
		description: decode(attrOf(metas, "name", "description", "content")),
		canonical: attrOf(tags(head, "link"), "rel", "canonical", "href"),
		h1: [...body.matchAll(/<h1[\s>]/gi)].length,
		lang: attrOf(tags(body, "html"), "lang", "", "lang", true),
	};
}

// ---- robots.txt and the sitemap ------------------------------------------------------

/** Live on production; elsewhere the production branch read from the route's source. */
function crawlerFiles(production: boolean, liveRobots: string, liveSitemap: string) {
	if (production)
		return {
			robots: liveRobots,
			sitemap: [...liveSitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname),
			dynamic: false,
		};
	const robotsSrc = readFileSync("src/routes/robots.txt/+server.ts", "utf8");
	const sitemapSrc = readFileSync("src/routes/sitemap.xml/+server.ts", "utf8");
	return {
		robots: (/\?\s*`([^`]*)`/.exec(robotsSrc)?.[1] ?? "").replace(/\\n/g, "\n"),
		sitemap: [...sitemapSrc.matchAll(/entry\(url\.origin, "([^"]+)"/g)].map((m) => m[1]),
		// The source lists every doc and published post from the database.
		dynamic: /\/docs\/\$\{d\.slug\}/.test(sitemapSrc) && /\/blog\/\$\{p\.slug\}/.test(sitemapSrc),
	};
}

/** A route name (as in ROUTES) → a RegExp for the paths it serves. */
const routePattern = (route: string) =>
	new RegExp(`^/${route.replace(" (server)", "").replace(/\[[^\]]+\]/g, "[^/]+")}$`);
/** How specific a route is: the later its first dynamic segment, the more (a static route most). */
const specificity = (route: string) => (route.includes("[") ? route.indexOf("[") : Infinity);
/** The route serving a path, the most specific first (/docs/sessions is docs/[slug], not [account]/sessions). */
const routeOf = (path: string): string | undefined =>
	(ROUTES as unknown[][])
		.map((r) => r[0] as string)
		.filter((r) => routePattern(r).test(path))
		.sort((a, b) => specificity(b) - specificity(a))[0];

// ---- checks -------------------------------------------------------------------------

/** A check: its name (the table column), pass / fail / not applicable (null), and what was wanted and found. */
type Check = [check: string, ok: boolean | null, expected: string, actual: string];

const isNoindex = (value: string | null) => /noindex/i.test(value ?? "");
const orNone = (value: string | null) => value ?? "none";
const statusOf = (p: Page) => p.chain.map((c) => c.status).join("→");
const canonicalPath = (p: Page) => (p.canonical ? new URL(p.canonical, p.finalUrl).pathname : null);

function publicChecks(p: Page, production: boolean): Check[] {
	const shown = p.status === 200 && p.chain.length === 1;
	const ifShown = (ok: boolean) => (shown ? ok : null);
	// Off production everything is noindex by design.
	const stage = production ? "no noindex" : "noindex (stage)";
	const checks: Check[] = [
		["status", shown, "200, no redirect", statusOf(p)],
		["header", isNoindex(p.header) !== production, stage, orNone(p.header)],
		["meta", ifShown(isNoindex(p.metaRobots) !== production), stage, orNone(p.metaRobots)],
		["robots.txt", p.robotsTxtAllows, "allowed", "disallowed"],
		["vercel", !p.vercelRuleNoindexes, "rule does not match", "rule matches (noindex)"],
		["sitemap", p.inSitemap, "listed", "missing"],
		["title", ifShown(!!p.title), "a <title>", "none"],
		["description", ifShown(!!p.description), "a meta description", "none"],
		["h1", ifShown(p.h1 === 1), "one <h1>", String(p.h1)],
		["lang", ifShown(!!p.lang), "<html lang>", "none"],
	];
	const canonical = canonicalPath(p);
	if (canonical && canonical !== p.path) checks.push(["canonical", false, p.path, canonical]);
	return checks;
}

function appChecks(p: Page): Check[] {
	return [
		["header", isNoindex(p.header), "noindex", orNone(p.header)],
		["meta", p.html ? isNoindex(p.metaRobots) : null, "noindex", orNone(p.metaRobots)],
		["robots.txt", !p.robotsTxtAllows, "disallowed", "allowed"],
		["vercel", p.vercelRuleNoindexes, "rule matches (noindex)", "rule does not match"],
		["sitemap", !p.inSitemap, "not listed", "listed"],
	];
}

const exceptionFor = (route: string, check: string): string | undefined =>
	exceptions[`${route}:${check}`] ?? exceptions[route];
function cellFor(ok: boolean | null, exception: string | undefined) {
	if (ok === null) return "–";
	if (ok) return "✓";
	return exception ? "~" : "✗";
}

/** The status column: the chain, with the status check's mark when it is not a pass. */
const statusCell = (p: Page, mark = "✓") => (mark === "✓" ? statusOf(p) : `${statusOf(p)} ${mark}`);

function checkPage(p: Page, production: boolean, findings: Finding[]) {
	if (p.absent) {
		p.cells.status = `${statusOf(p)} (none on this stage)`;
		return;
	}
	for (const [check, ok, expected, actual] of p.intent === "public"
		? publicChecks(p, production)
		: appChecks(p)) {
		const exception = exceptionFor(p.route, check);
		p.cells[check] = cellFor(ok, exception);
		if (ok === false)
			findings.push({ route: p.route || "/", path: p.path, check, expected, actual, exception });
	}
	p.cells.status = statusCell(p, p.cells.status);
}

/** Sitemap entries no route serves. */
function sitemapOutliers(sitemap: string[], findings: Finding[]) {
	for (const path of sitemap.filter((path) => routeOf(path) === undefined))
		findings.push({
			route: path,
			check: "sitemap",
			expected: "a known route",
			actual: "no route serves it",
		});
}

/** robots.txt Allow lines no public page uses. */
function allowOutliers(pages: Page[], robots: string, findings: Finding[]) {
	const publicPaths = pages.filter((p) => p.intent === "public" && !p.absent).map((p) => p.path);
	for (const m of robots.matchAll(/^Allow:\s*(\S+)/gim)) {
		const probe = `User-agent: *\nDisallow: /\nAllow: ${m[1]}\n`;
		if (!publicPaths.some((path) => robotsTxtAllows(probe, path)))
			findings.push({
				route: "robots.txt",
				check: "allow",
				expected: "matches a public page",
				actual: `Allow: ${m[1]} matches none`,
			});
	}
}

/** Pages grouped by a field's value. */
function groupBy(pages: Page[], field: "title" | "description") {
	const seen = new Map<string, string[]>();
	for (const p of pages) {
		const value = p[field];
		if (value) seen.set(value, [...(seen.get(value) ?? []), p.path]);
	}
	return seen;
}

/** Two public pages with one title or one description. */
function checkDuplicates(pages: Page[], findings: Finding[]) {
	const shown = pages.filter((p) => p.intent === "public" && !p.absent);
	for (const field of ["title", "description"] as const)
		for (const [value, paths] of groupBy(shown, field))
			if (paths.length > 1)
				findings.push({
					route: paths.join(", "),
					check: `duplicate ${field}`,
					expected: "unique",
					actual: value.slice(0, 80),
				});
}

// ---- output ---------------------------------------------------------------------------

const COLUMNS = [
	"status",
	"header",
	"meta",
	"robots.txt",
	"vercel",
	"sitemap",
	"title",
	"description",
	"h1",
];
const FINDING_COLUMNS = ["route", "path", "check", "expected", "actual"];
const LEGEND = "✓ as intended, ✗ a finding, ~ an exception, – not applicable";

const markdownTable = (rows: string[][]) =>
	[rows[0], rows[0].map(() => "---"), ...rows.slice(1)]
		.map((r) => `| ${r.join(" | ")} |`)
		.join("\n");

function render(pages: Page[], findings: Finding[], production: boolean) {
	const real = findings.filter((f) => !f.exception);
	const stage = production
		? "production"
		: "not production: noindex everywhere; robots.txt and sitemap from their route sources";
	const head = `Indexability audit of ${base} (${stage})`;
	const table = [
		["route", "path", "intent", ...COLUMNS],
		...pages.map((p) => [
			p.route || "/",
			p.path,
			p.intent,
			...COLUMNS.map((c) => p.cells[c] ?? "–"),
		]),
	];
	const findingRows = findings.map((f) => [
		f.route,
		f.path ?? "",
		f.check,
		f.expected,
		f.exception ? `${f.actual} (exception: ${f.exception})` : f.actual,
	]);
	const excepted = findings.length - real.length;
	const summary = `${pages.length} pages, ${pages.filter((p) => p.intent === "public").length} public, ${real.length} findings${excepted ? ` (+${excepted} exceptions)` : ""}`;
	const findingsMd = findings.length ? markdownTable([FINDING_COLUMNS, ...findingRows]) : "None.";
	const markdown = `# ${head}\n\n${LEGEND}\n\n${markdownTable(table)}\n\n## Findings\n\n${findingsMd}\n\n${summary}\n`;
	return { head, table, findingRows, summary, markdown, real };
}

function printTable(rows: string[][]) {
	const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
	for (const r of rows)
		console.log(r.map((c, i) => c + " ".repeat(widths[i] - c.length)).join("  "));
}

// ---- run --------------------------------------------------------------------------------

interface Context {
	robots: string;
	sitemap: string[];
	inSitemap: (path: string) => boolean;
	rules: VercelHeaderRule[];
	production: boolean;
}

async function auditPath(route: string, path: string, ctx: Context): Promise<Page> {
	const { chain, header, body } = await fetchChain(path).catch((e: unknown) => ({
		chain: [{ status: 0, url: `${base}${path} (${String(e).slice(0, 60)})` }],
		header: null,
		body: "",
	}));
	return {
		route,
		path,
		intent: isIndexablePath(path) ? "public" : "app",
		chain,
		status: chain[0].status,
		finalUrl: chain[chain.length - 1].url,
		header,
		...readHtml(body),
		inSitemap: ctx.inSitemap(path),
		robotsTxtAllows: robotsTxtAllows(ctx.robots, path),
		vercelRuleNoindexes: vercelHeaderRuleMatches(ctx.rules, path),
		cells: {},
	};
}

/** robots.txt, the sitemap and vercel.json's header rules, and which stage the base is. */
async function loadContext(): Promise<Context> {
	const liveRobots = await (await fetch(`${base}/robots.txt`)).text();
	const liveSitemap = await (await fetch(`${base}/sitemap.xml`)).text();
	const production = /^Allow:/m.test(liveRobots);
	const { robots, sitemap, dynamic } = crawlerFiles(production, liveRobots, liveSitemap);
	const rules = JSON.parse(readFileSync("vercel.json", "utf8")).headers as VercelHeaderRule[];
	const listed = new Set(sitemap);
	const inSitemap = (path: string) =>
		listed.has(path) || (dynamic && /^\/(docs|blog)\/[^/]+$/.test(path));
	return { robots, sitemap, inSitemap, rules, production };
}

/** The database's segments, with the sample doc and post from the live sitemap where it has them (the database may be another stage's). */
async function segmentsFor(sitemap: string[]) {
	const segments: Record<string, unknown> = await loadSegments();
	const firstSlug = (dir: string) => sitemap.find((p) => p.startsWith(`/${dir}/`))?.split("/")[2];
	const docSlug = firstSlug("docs");
	const postSlug = firstSlug("blog");
	if (docSlug) segments.doc = { slug: docSlug };
	if (postSlug) segments.post = { slug: postSlug };
	return segments;
}

/** Every route, then every sitemap entry the routes did not already cover. */
async function auditAll(ctx: Context) {
	const segments = await segmentsFor(ctx.sitemap);
	const pages: Page[] = [];
	for (const [route, url, anonymous] of ROUTES as Expectation[]) {
		const page = await auditPath(route, fillUrl(url, segments), ctx);
		// A public route this stage has nothing for (no published post yet): the smoke list expects no 200.
		const statuses = typeof anonymous === "function" ? anonymous(segments) : anonymous;
		page.absent = page.intent === "public" && !statuses.includes(200);
		pages.push(page);
	}
	const audited = new Set(pages.map((p) => p.path));
	for (const path of ctx.sitemap.filter((path) => !audited.has(path)))
		pages.push(await auditPath(`${routeOf(path) ?? "(unknown)"} [sitemap]`, path, ctx));
	return pages;
}

function output(
	out: ReturnType<typeof render>,
	pages: Page[],
	findings: Finding[],
	production: boolean,
) {
	console.log(`${out.head}\n${LEGEND}\n`);
	printTable(out.table);
	console.log("\nFindings:");
	if (out.findingRows.length) printTable([FINDING_COLUMNS, ...out.findingRows]);
	else console.log("  none");
	console.log(`\n${out.summary}`);
	const report = argPath("--report");
	if (report) writeFileSync(report, out.markdown);
	const json = argPath("--json");
	if (json) writeFileSync(json, JSON.stringify({ base, production, pages, findings }, null, "\t"));
}

async function main() {
	const missing = missingRoutes();
	if (missing.length) {
		console.error(`Routes with no row in scripts/lib/siteRoutes.mjs:\n  ${missing.join("\n  ")}`);
		process.exit(2);
	}
	const ctx = await loadContext();
	const pages = await auditAll(ctx);
	const findings: Finding[] = [];
	for (const p of pages) checkPage(p, ctx.production, findings);
	sitemapOutliers(ctx.sitemap, findings);
	allowOutliers(pages, ctx.robots, findings);
	checkDuplicates(pages, findings);
	const out = render(pages, findings, ctx.production);
	output(out, pages, findings, ctx.production);
	process.exit(out.real.length ? 1 : 0);
}

await main();
