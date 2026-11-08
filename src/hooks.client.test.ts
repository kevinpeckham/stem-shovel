import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

/**
 * The client hook: a chunk the current build no longer has is what an open tab
 * meets after a deploy, not a fault, so only a failure with no new version
 * behind it reaches Sentry.
 */

// vi.mock factories are hoisted above imports, so their inputs must be hoisted too.
const h = vi.hoisted(() => ({
	report: vi.fn(),
	check: vi.fn(),
	breadcrumb: vi.fn(),
	navigating: { to: null as unknown },
	dev: false,
	options: undefined as unknown,
	page: { url: new URL("https://www.stemshovel.com/dashboard") },
}));
vi.mock("$app/env", () => ({
	get dev() {
		return h.dev;
	},
}));
vi.mock("$app/state", () => ({
	updated: { check: h.check },
	navigating: h.navigating,
	page: h.page,
}));
vi.mock("@sentry/sveltekit", () => ({
	init: (options: unknown) => void (h.options = options),
	replayIntegration: () => ({}),
	handleErrorWithSentry: () => h.report,
	addBreadcrumb: h.breadcrumb,
}));

// The hook reads location when it loads (Sentry's environment), so the browser globals go first.
const reload = vi.fn();
const store = new Map<string, string>();
vi.stubGlobal("location", { hostname: "localhost", reload });
vi.stubGlobal("sessionStorage", {
	getItem: (key: string) => store.get(key) ?? null,
	setItem: (key: string, value: string) => void store.set(key, value),
	removeItem: (key: string) => void store.delete(key),
});

const { handleError } = await import("./hooks.client");

const event = {
	params: {},
	url: new URL("https://www.stemshovel.com/"),
	route: { id: "/" as const },
};
const caught = (error: unknown) => ({ kind: "unknown" as const, error, event });
const staleChunk = new TypeError(
	"Failed to fetch dynamically imported module: https://www.stemshovel.com/_app/immutable/nodes/59.D2zoqTsl.js",
);

beforeEach(() => {
	vi.clearAllMocks();
	h.navigating.to = null;
	h.dev = false;
	store.clear();
});

describe("handleError", () => {
	it("keeps a chunk retired by a deploy out of Sentry", async () => {
		h.check.mockResolvedValue(true);
		await handleError(caught(staleChunk));
		expect(h.report).not.toHaveBeenCalled();
	});
	it("reloads for a dev-server module that would not load, as a breadcrumb", async () => {
		h.dev = true;
		const devChunk = new TypeError(
			"Failed to fetch dynamically imported module: https://stem-shovel.wr.lj.dev/.svelte-kit/generated/dev/client/nodes/19.js?t=1794087247278",
		);
		await handleError(caught(devChunk));
		expect(reload).toHaveBeenCalledOnce();
		expect(h.breadcrumb).toHaveBeenCalledOnce();
		expect(h.report).not.toHaveBeenCalled();
		expect(h.check).not.toHaveBeenCalled();
	});
	it("reports a dev-server module that still fails right after its reload", async () => {
		h.dev = true;
		h.check.mockResolvedValue(false);
		const devChunk = new TypeError(
			"Failed to fetch dynamically imported module: https://stem-shovel.wr.lj.dev/.svelte-kit/generated/dev/client/nodes/19.js?t=1",
		);
		await handleError(caught(devChunk));
		await handleError(caught(devChunk));
		expect(reload).toHaveBeenCalledOnce();
		expect(h.report).toHaveBeenCalledOnce();
	});
	it("does not reload outside dev", async () => {
		h.check.mockResolvedValue(false);
		await handleError(caught(staleChunk));
		expect(reload).not.toHaveBeenCalled();
		expect(h.report).toHaveBeenCalledOnce();
	});
	it("reports a chunk that failed with no new version out", async () => {
		h.check.mockResolvedValue(false);
		await handleError(caught(staleChunk));
		expect(h.report).toHaveBeenCalledOnce();
	});
	it("reports any other error without asking for the version", async () => {
		await handleError(caught(new Error("boom")));
		expect(h.check).not.toHaveBeenCalled();
		expect(h.report).toHaveBeenCalledOnce();
	});
	it("keeps a preload that got no response out of Sentry, as a breadcrumb", async () => {
		await handleError(caught(new TypeError("Failed to fetch")));
		expect(h.report).not.toHaveBeenCalled();
		expect(h.breadcrumb).toHaveBeenCalledOnce();
	});
	it("keeps a hover preload of another page out of Sentry (STEM-SHOVEL-71)", async () => {
		h.page.url = new URL("https://www.stemshovel.com/releases");
		const preload = {
			params: {},
			url: new URL("https://www.stemshovel.com/docs/copyright-policy"),
			route: { id: "/docs/[slug]" as const },
		};
		await handleError({
			kind: "unknown" as const,
			error: new TypeError("Failed to fetch"),
			event: preload,
		});
		expect(h.report).not.toHaveBeenCalled();
		expect(h.breadcrumb).toHaveBeenCalledWith(
			expect.objectContaining({
				category: "sveltekit.preload",
				message: "Preload of /docs/copyright-policy got no response",
			}),
		);
		h.page.url = new URL("https://www.stemshovel.com/dashboard");
	});
	it("reports a navigation that got no response", async () => {
		h.navigating.to = { url: event.url };
		await handleError(caught(new TypeError("Failed to fetch")));
		expect(h.report).toHaveBeenCalledOnce();
	});
	it("reports an invalidate of the current page that got no response", async () => {
		h.page.url = event.url;
		await handleError(caught(new TypeError("Load failed")));
		expect(h.report).toHaveBeenCalledOnce();
		h.page.url = new URL("https://www.stemshovel.com/dashboard");
	});
});

/** STEM-SHOVEL-1A: a hot update Vite could not apply is left as a breadcrumb in development only. */
describe("beforeSend", () => {
	const beforeSend = (event: object) =>
		(h.options as { beforeSend: (event: object) => object | null }).beforeSend(event);
	const hmrFailure = {
		exception: {
			values: [
				{
					type: "TypeError",
					value: "Cannot read properties of undefined (reading 'default')",
					stacktrace: {
						frames: [
							{ filename: "/@vite/client" },
							{ filename: "/src/routes/dashboard/+page.svelte" },
						],
					},
				},
			],
		},
	};
	it("drops a failed hot update in development, leaving a breadcrumb", () => {
		h.dev = true;
		expect(beforeSend(hmrFailure)).toBeNull();
		expect(h.breadcrumb).toHaveBeenCalledWith(
			expect.objectContaining({
				category: "sveltekit.dev-hmr",
				message: "Hot update of /src/routes/dashboard/+page.svelte failed",
			}),
		);
	});
	it("reports it outside development", () => {
		expect(beforeSend(hmrFailure)).toBe(hmrFailure);
		expect(h.breadcrumb).not.toHaveBeenCalled();
	});
	it("reports other errors in development", () => {
		h.dev = true;
		const other = { exception: { values: [{ type: "Error", value: "boom" }] } };
		expect(beforeSend(other)).toBe(other);
	});
});
