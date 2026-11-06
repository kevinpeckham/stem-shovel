/**
 * Sentry scan: the unresolved issues of one environment seen in the last N
 * hours, newest first, each with the essentials of its latest event (the
 * innermost in-app frames with their source context, the tags, the request).
 * The first half of the triage pipeline; scripts/sentry-diagnose.ts reads the
 * --json file and briefs an agent on each issue. Read-only: GET requests to
 * Sentry's API and nothing else.
 *
 *   bun run sentry:scan                                    # production, last 24 hours, up to 25
 *   bun run sentry:scan --hours 336 --limit 5 --json scan.json
 *   bun run sentry:scan --environment preview
 *
 * Env: SENTRY_AUTH_TOKEN (through varlock), a Bearer token with read access
 * to the organization. The organization and project ids are the DSN's
 * (src/lib/constants/sentryDsn.ts). The window is the search query's
 * `lastSeen:-<N>h` (the issues endpoint's statsPeriod takes only 24h or 14d
 * and does not filter); --limit is at most 100 (one page). Exits 0 (an empty
 * list too), 1 on an API error (the status and the start of the body
 * printed), 2 on a bad argument or a missing token.
 */
import { writeFileSync } from "node:fs";

const ORG = "4505247956860928";
const PROJECT = "4512102516457472";
const API = "https://sentry.io/api/0";
/** Latest events fetched at once. */
const CONCURRENCY = 4;
/** In-app frames kept per event, innermost last. */
const FRAMES = 8;
const BREADCRUMBS = 10;

export interface Frame {
	filename: string | null;
	function: string | null;
	line: number | null;
	col: number | null;
	inApp: boolean;
	/** [line number, source line] pairs around the frame, when Sentry has them. */
	context?: [number, string][];
}
export interface LatestEvent {
	eventId: string;
	dateCreated: string;
	release: string | null;
	message: string | null;
	exceptions: { type: string | null; value: string | null; mechanism: string | null }[];
	/** The innermost in-app frames of the last exception (all frames when none is in-app). */
	frames: Frame[];
	tags: Record<string, string>;
	request: { url: string | null; method: string | null } | null;
	browser: string | null;
	os: string | null;
	environment: string | null;
	url: string | null;
	transaction: string | null;
	breadcrumbs: {
		timestamp: string | null;
		category: string | null;
		level: string | null;
		message: string | null;
	}[];
}
export interface ScannedIssue {
	id: string;
	shortId: string;
	title: string;
	culprit: string | null;
	level: string;
	count: string;
	userCount: number;
	firstSeen: string;
	lastSeen: string;
	permalink: string;
	isUnhandled: boolean;
	platform: string;
	priority: string | null;
	latestEvent: LatestEvent | null;
}
export interface ScanFile {
	scannedAt: string;
	environment: string;
	hours: number;
	count: number;
	issues: ScannedIssue[];
}

class ApiError extends Error {
	constructor(
		readonly url: string,
		readonly status: number,
		readonly body: string,
	) {
		super(`Sentry API ${status} for ${url}`);
	}
}

/** The value after a flag, if given. */
const argPath = (flag: string) => {
	const i = process.argv.indexOf(flag);
	return i > 0 ? process.argv[i + 1] : undefined;
};
function fail(message: string): never {
	console.error(message);
	process.exit(2);
}
function positiveInt(flag: string, fallback: number, max = Infinity) {
	const raw = argPath(flag);
	if (raw === undefined) return fallback;
	const n = Number(raw);
	if (!Number.isInteger(n) || n < 1 || n > max)
		fail(
			`${flag} wants a whole number${max < Infinity ? ` from 1 to ${max}` : " above 0"}, got ${JSON.stringify(raw)}`,
		);
	return n;
}

const KNOWN = new Set(["--hours", "--environment", "--limit", "--json"]);
for (const a of process.argv.slice(2))
	if (a.startsWith("--") && !KNOWN.has(a))
		fail(`Unknown flag ${a} (known: ${[...KNOWN].join(", ")})`);
for (const flag of KNOWN)
	if (process.argv.includes(flag) && (argPath(flag) ?? "--").startsWith("--"))
		fail(`${flag} wants a value`);

const hours = positiveInt("--hours", 24);
const limit = positiveInt("--limit", 25, 100);
const environment = argPath("--environment") ?? "production";
const jsonOut = argPath("--json");
const token = process.env.SENTRY_AUTH_TOKEN;
if (!token) fail("SENTRY_AUTH_TOKEN is not set (run through varlock: bun run sentry:scan)");

async function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
	const url = `${API}${path}${Object.keys(params).length ? `?${new URLSearchParams(params)}` : ""}`;
	const res = await fetch(url, { method: "GET", headers: { Authorization: `Bearer ${token}` } });
	const body = await res.text();
	if (!res.ok) throw new ApiError(url, res.status, body);
	return JSON.parse(body) as T;
}

/** Runs `fn` over `items`, `n` at a time, keeping the order. */
async function pool<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
	const out: R[] = Array.from({ length: items.length });
	let next = 0;
	const worker = async () => {
		while (next < items.length) {
			const i = next++;
			out[i] = await fn(items[i]);
		}
	};
	await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
	return out;
}

// ---- the latest event, reduced ------------------------------------------------------

/* oxlint-disable typescript/no-explicit-any -- Sentry's event JSON, read defensively */
function frameOf(f: any): Frame {
	const frame: Frame = {
		filename: f.filename ?? f.absPath ?? null,
		function: f.function ?? null,
		line: f.lineNo ?? null,
		col: f.colNo ?? null,
		inApp: Boolean(f.inApp),
	};
	if (Array.isArray(f.context) && f.context.length) frame.context = f.context;
	return frame;
}
function reduceEvent(e: any): LatestEvent {
	const entries: any[] = Array.isArray(e.entries) ? e.entries : [];
	const entry = (type: string) => entries.find((x) => x?.type === type)?.data;
	const values: any[] = entry("exception")?.values ?? [];
	// Sentry lists a chain cause first; the last one is the exception thrown, with its frames.
	const allFrames: any[] = values.at(-1)?.stacktrace?.frames ?? [];
	const inApp = allFrames.filter((f) => f?.inApp);
	const frames = (inApp.length ? inApp : allFrames).slice(-FRAMES).map(frameOf);
	const tags: Record<string, string> = {};
	for (const t of e.tags ?? []) if (t?.key) tags[t.key] = String(t.value);
	const request = entry("request");
	const crumbs: any[] = entry("breadcrumbs")?.values ?? [];
	const release = typeof e.release === "string" ? e.release : (e.release?.version ?? tags.release);
	return {
		eventId: e.eventID,
		dateCreated: e.dateCreated,
		release: release ?? null,
		message: e.message || null,
		exceptions: values.map((v) => ({
			type: v?.type ?? null,
			value: v?.value ?? null,
			mechanism: v?.mechanism?.type ?? null,
		})),
		frames,
		tags,
		request: request ? { url: request.url ?? null, method: request.method ?? null } : null,
		browser: tags.browser ?? null,
		os: tags.os ?? null,
		environment: tags.environment ?? null,
		url: tags.url ?? null,
		transaction: tags.transaction ?? null,
		breadcrumbs: crumbs.slice(-BREADCRUMBS).map((c) => ({
			timestamp: c?.timestamp ?? null,
			category: c?.category ?? null,
			level: c?.level ?? null,
			message: c?.message ?? (c?.data ? JSON.stringify(c.data).slice(0, 300) : null),
		})),
	};
}
/* oxlint-enable typescript/no-explicit-any */

// ---- run ------------------------------------------------------------------------------

try {
	const issues = await get<Omit<ScannedIssue, "latestEvent">[]>(
		`/projects/${ORG}/${PROJECT}/issues/`,
		{
			query: `is:unresolved lastSeen:-${hours}h`,
			statsPeriod: "24h",
			sort: "date",
			environment,
			limit: String(limit),
		},
	);
	const chosen = issues.slice(0, limit);
	const scanned: ScannedIssue[] = await pool(chosen, CONCURRENCY, async (i) => ({
		id: i.id,
		shortId: i.shortId,
		title: i.title,
		culprit: i.culprit ?? null,
		level: i.level,
		count: i.count,
		userCount: i.userCount,
		firstSeen: i.firstSeen,
		lastSeen: i.lastSeen,
		permalink: i.permalink,
		isUnhandled: i.isUnhandled,
		platform: i.platform,
		priority: i.priority ?? null,
		latestEvent: reduceEvent(await get(`/issues/${i.id}/events/latest/`)),
	}));

	console.log(
		`${scanned.length} unresolved issue(s) in ${environment}, seen in the last ${hours} h`,
	);
	if (scanned.length) {
		const rows = scanned.map((i) => [
			i.shortId,
			i.level,
			String(i.count),
			String(i.userCount),
			i.lastSeen.slice(0, 10),
			i.title.length > 70 ? `${i.title.slice(0, 69)}…` : i.title,
		]);
		const head = ["issue", "level", "count", "users", "last seen", "title"];
		const widths = head.map((h, c) => Math.max(h.length, ...rows.map((r) => r[c].length)));
		for (const r of [head, ...rows])
			console.log(
				r.map((cell, c) => (c === r.length - 1 ? cell : cell.padEnd(widths[c]))).join("  "),
			);
	}
	if (jsonOut) {
		const file: ScanFile = {
			scannedAt: new Date().toISOString(),
			environment,
			hours,
			count: scanned.length,
			issues: scanned,
		};
		writeFileSync(jsonOut, `${JSON.stringify(file, null, "\t")}\n`);
		console.log(`wrote ${jsonOut}`);
	}
} catch (e) {
	if (e instanceof ApiError) {
		console.error(`Sentry API error ${e.status} for ${e.url}\n${e.body.slice(0, 300)}`);
	} else {
		console.error(e);
	}
	process.exit(1);
}
