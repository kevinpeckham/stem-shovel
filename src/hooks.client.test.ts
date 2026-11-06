import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

/**
 * The client hook: a chunk the current build no longer has is what an open tab
 * meets after a deploy, not a fault, so only a failure with no new version
 * behind it reaches Sentry.
 */

// vi.mock factories are hoisted above imports, so their inputs must be hoisted too.
const h = vi.hoisted(() => ({ report: vi.fn(), check: vi.fn() }));
vi.mock("$app/env", () => ({ dev: true }));
vi.mock("$app/state", () => ({ updated: { check: h.check } }));
vi.mock("@sentry/sveltekit", () => ({
	init: () => {},
	replayIntegration: () => ({}),
	handleErrorWithSentry: () => h.report,
}));

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

beforeEach(() => vi.clearAllMocks());

describe("handleError", () => {
	it("keeps a chunk retired by a deploy out of Sentry", async () => {
		h.check.mockResolvedValue(true);
		await handleError(caught(staleChunk));
		expect(h.report).not.toHaveBeenCalled();
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
});
