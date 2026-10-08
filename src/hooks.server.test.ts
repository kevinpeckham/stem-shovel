import type { Handle, HandleServerError } from "@sveltejs/kit/hooks";
import type { RequestEvent } from "@sveltejs/kit";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ROBOTS_NOINDEX, SECURITY_HEADERS } from "#lib/constants/securityHeaders.js";

/**
 * The server hook: who `locals.user` becomes (a Better Auth session, the
 * screenshot bot's token, or nobody), the memberships loaded for them, the
 * headers every response carries, and the host rules that answer before the
 * app runs (the short domain, the chord player's vanity domains).
 */

// vi.mock factories are hoisted above imports, so their inputs must be hoisted too.
const h = vi.hoisted(() => ({
	env: {} as Record<string, string | undefined>,
	getSession: vi.fn(),
	userFindFirst: vi.fn(),
	memberFindMany: vi.fn(),
	accountFindMany: vi.fn(),
	resolveShortLink: vi.fn(),
	captureException: vi.fn(),
}));
vi.mock("varlock/env", () => ({ ENV: h.env, initVarlockEnv: () => {} }));
vi.mock("$app/env", () => ({ dev: false, building: false, browser: false, version: "0" }));
vi.mock("#lib/auth.js", () => ({ auth: { api: { getSession: h.getSession } } }));
vi.mock("#lib/server/db/index.js", () => ({
	db: {
		query: {
			user: { findFirst: h.userFindFirst },
			accountMember: { findMany: h.memberFindMany },
			account: { findMany: h.accountFindMany },
		},
	},
	// drizzle's `eq()` keeps whatever it is handed; no query runs here.
	schema: {
		user: { email: "email" },
		accountMember: { userId: "user_id" },
		account: { status: "status" },
	},
}));
vi.mock("#lib/server/shortLinks.js", () => ({ resolveShortLink: h.resolveShortLink }));
vi.mock("@sentry/node", () => ({ captureException: h.captureException }));
// Better Auth's handler answers its own /api/auth routes; for everything else it is `resolve`.
vi.mock("better-auth/svelte-kit", () => ({
	svelteKitHandler: ({
		event,
		resolve,
	}: {
		event: RequestEvent;
		resolve: (e: RequestEvent) => unknown;
	}) => resolve(event),
}));

const { handle, handleError } = await import("./hooks.server");

const SITE = "https://www.stemshovel.com";
const PREVIEW_TOKEN = "p".repeat(40);

function fakeEvent(
	url: string,
	{
		headers = {},
		cookies = {},
	}: { headers?: Record<string, string>; cookies?: Record<string, string> } = {},
) {
	const request = new Request(url, { headers });
	return {
		request,
		url: new URL(url),
		cookies: {
			get: vi.fn((name: string) => cookies[name]),
			set: vi.fn(),
			delete: vi.fn(),
		},
		locals: {} as App.Locals,
		setHeaders: vi.fn(),
		getClientAddress: () => "203.0.113.7",
		route: { id: "/[account]" },
	} as unknown as RequestEvent;
}

const resolve = vi.fn(async () => new Response("page"));
const run = (event: RequestEvent) => handle({ event, resolve } as unknown as Parameters<Handle>[0]);

const sessionUser = {
	id: "user-1",
	name: "Kevin",
	email: "kevin@example.com",
	isActive: true,
	isSystemAdmin: false,
	isSuperAdmin: false,
	twoFactorEnabled: true,
};
const membership = (accountId: string, status = "active", role = "member") => ({
	accountId,
	role,
	userId: "user-1",
	account: { slug: `slug-${accountId}`, name: `Account ${accountId}`, status },
});

beforeEach(() => {
	vi.resetAllMocks();
	for (const key of Object.keys(h.env)) delete h.env[key];
	resolve.mockResolvedValue(new Response("page"));
	h.getSession.mockResolvedValue(null);
	h.memberFindMany.mockResolvedValue([]);
	h.accountFindMany.mockResolvedValue([]);
	h.userFindFirst.mockResolvedValue(null);
});

describe("response headers", () => {
	it("sets every security header on the response", async () => {
		const res = await run(fakeEvent(`${SITE}/`));
		for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
			expect(res.headers.get(name)).toBe(value);
		}
		expect(res.headers.get("x-frame-options")).toBe("DENY");
		expect(res.headers.get("x-content-type-options")).toBe("nosniff");
		expect(res.headers.get("permissions-policy")).toContain("microphone=(self)");
		expect(res.headers.get("permissions-policy")).toContain("camera=()");
	});
	it("marks a private page noindex, on production too", async () => {
		h.env.VERCEL_ENV = "production";
		const res = await run(fakeEvent(`${SITE}/some-account/projects`));
		expect(res.headers.get("x-robots-tag")).toBe(ROBOTS_NOINDEX);
	});
	it("marks an indexable page noindex everywhere but production", async () => {
		h.env.VERCEL_ENV = "preview";
		const res = await run(fakeEvent(`${SITE}/`));
		expect(res.headers.get("x-robots-tag")).toBe(ROBOTS_NOINDEX);
	});
	it("leaves production's front page indexable", async () => {
		h.env.VERCEL_ENV = "production";
		const res = await run(fakeEvent(`${SITE}/`));
		expect(res.headers.get("x-robots-tag")).toBeNull();
	});
});

describe("locals", () => {
	it("signed out: user null, no memberships, no membership query", async () => {
		const event = fakeEvent(`${SITE}/`);
		await run(event);
		expect(event.locals.user).toBeNull();
		expect(event.locals.memberships).toEqual([]);
		expect(h.memberFindMany).not.toHaveBeenCalled();
		expect(resolve).toHaveBeenCalledWith(event);
	});
	it("a session fills in the user (booleans normalised) and the active memberships", async () => {
		h.getSession.mockResolvedValue({ user: { ...sessionUser, isSystemAdmin: undefined } });
		h.memberFindMany.mockResolvedValue([
			membership("a1"),
			membership("a2", "suspended", "owner"),
			membership("a3", "active", "admin"),
		]);
		const event = fakeEvent(`${SITE}/`);
		await run(event);
		expect(event.locals.user).toEqual({
			id: "user-1",
			name: "Kevin",
			email: "kevin@example.com",
			isSystemAdmin: false,
			isSuperAdmin: false,
			twoFactorEnabled: true,
		});
		expect(event.locals.memberships).toEqual([
			{ accountId: "a1", slug: "slug-a1", name: "Account a1", role: "member" },
			{ accountId: "a3", slug: "slug-a3", name: "Account a3", role: "admin" },
		]);
		expect(h.getSession).toHaveBeenCalledWith({ headers: event.request.headers });
	});
	it("a deactivated user's session is nobody", async () => {
		h.getSession.mockResolvedValue({ user: { ...sessionUser, isActive: false } });
		const event = fakeEvent(`${SITE}/`);
		await run(event);
		expect(event.locals.user).toBeNull();
		expect(event.locals.memberships).toEqual([]);
	});
	it("a super admin acts as owner of every other active account", async () => {
		h.getSession.mockResolvedValue({
			user: { ...sessionUser, isSuperAdmin: true, isSystemAdmin: true },
		});
		h.memberFindMany.mockResolvedValue([membership("a1")]);
		h.accountFindMany.mockResolvedValue([
			{ id: "a1", slug: "slug-a1", name: "Account a1" },
			{ id: "a9", slug: "slug-a9", name: "Account a9" },
		]);
		const event = fakeEvent(`${SITE}/`);
		await run(event);
		expect(event.locals.user?.isSuperAdmin).toBe(true);
		expect(event.locals.memberships).toEqual([
			{ accountId: "a1", slug: "slug-a1", name: "Account a1", role: "member" },
			{ accountId: "a9", slug: "slug-a9", name: "Account a9", role: "owner", actingAs: true },
		]);
	});
	it("an ordinary user never triggers the all-accounts query", async () => {
		h.getSession.mockResolvedValue({ user: sessionUser });
		await run(fakeEvent(`${SITE}/`));
		expect(h.accountFindMany).not.toHaveBeenCalled();
	});
});

describe("preview token (the screenshot bot)", () => {
	const bot = {
		id: "bot-1",
		name: "Screenshot Bot",
		email: "screenshot-bot@stem-shovel.com",
		isActive: true,
		isSystemAdmin: false,
		isSuperAdmin: false,
	};
	beforeEach(() => {
		h.env.PREVIEW_AUTH_TOKEN = PREVIEW_TOKEN;
		h.userFindFirst.mockResolvedValue(bot);
	});
	it("a valid header token is the bot, and the session is never consulted", async () => {
		const event = fakeEvent(`${SITE}/`, { headers: { "x-preview-token": PREVIEW_TOKEN } });
		await run(event);
		expect(event.locals.user).toMatchObject({ id: "bot-1", name: "Screenshot Bot" });
		expect(h.getSession).not.toHaveBeenCalled();
	});
	it("the cookie works too", async () => {
		const event = fakeEvent(`${SITE}/`, { cookies: { preview_token: PREVIEW_TOKEN } });
		await run(event);
		expect(event.locals.user?.id).toBe("bot-1");
	});
	it("a wrong token falls through to the session (nobody here)", async () => {
		const event = fakeEvent(`${SITE}/`, { headers: { "x-preview-token": "x".repeat(40) } });
		await run(event);
		expect(event.locals.user).toBeNull();
		expect(h.userFindFirst).not.toHaveBeenCalled();
		expect(h.getSession).toHaveBeenCalled();
	});
	it("the bypass is closed when no token is configured", async () => {
		delete h.env.PREVIEW_AUTH_TOKEN;
		const event = fakeEvent(`${SITE}/`, { headers: { "x-preview-token": PREVIEW_TOKEN } });
		await run(event);
		expect(event.locals.user).toBeNull();
	});
});

describe("the short domain", () => {
	beforeEach(() => {
		h.env.SHORT_LINK_ORIGIN = "https://shvl.me";
	});
	it("a live code redirects to its page on the site, uncached", async () => {
		h.resolveShortLink.mockResolvedValue({ target: "/band/album/song?take=2#notes" });
		const res = await run(fakeEvent("https://shvl.me/AbCd2345"));
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe(`${SITE}/band/album/song?take=2#notes`);
		expect(res.headers.get("cache-control")).toBe("no-store");
		expect(h.resolveShortLink).toHaveBeenCalledWith("AbCd2345");
		expect(resolve).not.toHaveBeenCalled();
	});
	it("www and a trailing slash are the same code", async () => {
		h.resolveShortLink.mockResolvedValue({ target: "/x" });
		const res = await run(fakeEvent("https://www.shvl.me/AbCd2345/"));
		expect(res.headers.get("location")).toBe(`${SITE}/x`);
	});
	it("a dead or expired code goes to the front page", async () => {
		h.resolveShortLink.mockResolvedValue(null);
		const res = await run(fakeEvent("https://shvl.me/AbCd2345"));
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe(`${SITE}/`);
	});
	it("any other path on the short domain goes home without a lookup", async () => {
		const res = await run(fakeEvent("https://shvl.me/piano"));
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe(`${SITE}/`);
		expect(h.resolveShortLink).not.toHaveBeenCalled();
	});
	it("the short domain's responses carry no session work", async () => {
		await run(fakeEvent("https://shvl.me/AbCd2345"));
		expect(h.getSession).not.toHaveBeenCalled();
	});
	it("without SHORT_LINK_ORIGIN the same host is just another request", async () => {
		delete h.env.SHORT_LINK_ORIGIN;
		const res = await run(fakeEvent("https://shvl.me/AbCd2345"));
		expect(res.status).toBe(200);
		expect(resolve).toHaveBeenCalled();
	});
	it("an unknown host passes through to the app", async () => {
		const event = fakeEvent("https://example.net/AbCd2345");
		const res = await run(event);
		expect(res.status).toBe(200);
		expect(resolve).toHaveBeenCalledWith(event);
		expect(h.resolveShortLink).not.toHaveBeenCalled();
	});
});

describe("the chord player's vanity domains", () => {
	it("send every path to the chord player, permanently", async () => {
		const res = await run(fakeEvent("https://www.fifths.app/anything?x=1"));
		expect(res.status).toBe(308);
		expect(res.headers.get("location")).toBe("https://www.stemshovel.com/chord-player");
		expect(resolve).not.toHaveBeenCalled();
	});
});

describe("handleError", () => {
	const call = (input: Record<string, unknown>) =>
		handleError({
			event: fakeEvent(`${SITE}/band`, {}),
			...input,
		} as unknown as Parameters<HandleServerError>[0]);
	it("reports an unknown error to Sentry with the route and method", async () => {
		const boom = new Error("boom");
		await call({ kind: "unknown", error: boom });
		expect(h.captureException).toHaveBeenCalledWith(boom, {
			tags: { route: "/[account]", method: "GET" },
			extra: { path: "/band", status: 500 },
		});
	});
	it("never reports the framework's 404 or an app error", async () => {
		await call({ kind: "framework", error: { status: 404, message: "Not Found" } });
		await call({ kind: "app", error: { status: 403, message: "Members only" } });
		expect(h.captureException).not.toHaveBeenCalled();
	});
	it("answers a validation error plainly and logs the count, never the values", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const out = await call({
			kind: "validation",
			error: { status: 400, message: "Bad Request" },
			issues: [{ message: "Invalid email", path: ["email"] }, { message: "Required" }],
		});
		expect(out).toEqual({ message: "That request was not valid." });
		expect(warn).toHaveBeenCalledWith("[validation] GET /band: 2 issues from 203.0.113.7");
		expect(h.captureException).not.toHaveBeenCalled();
		warn.mockRestore();
	});
});
