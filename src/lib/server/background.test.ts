import { afterEach, describe, expect, it, vi } from "vite-plus/test";

/** background(): the work runs, and a failure is logged and reported to Sentry under its kind, never thrown. */
const h = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@sentry/node", () => ({ captureException: h.captureException }));

const { background } = await import("./background");

/** The work's promise has settled (and its catch run) once the microtasks drain. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
	vi.restoreAllMocks();
	h.captureException.mockReset();
});

describe("background", () => {
	it("logs a rejected work and reports it with the job's kind and count", async () => {
		const logged = vi.spyOn(console, "error").mockImplementation(() => {});
		const boom = new Error("boom");
		background(() => Promise.reject(boom), { kind: "mix", count: 3 });
		await flush();
		expect(logged).toHaveBeenCalledWith("[background]", boom);
		expect(h.captureException).toHaveBeenCalledWith(boom, {
			tags: { job: "mix" },
			extra: { count: 3 },
		});
	});
	it("tags a failure without a context as background", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		background(() => Promise.reject(new Error("x")));
		await flush();
		expect(h.captureException).toHaveBeenCalledWith(expect.any(Error), {
			tags: { job: "background" },
			extra: { count: undefined },
		});
	});
	it("reports nothing when the work succeeds", async () => {
		const ran = vi.fn(async () => {});
		background(ran, { kind: "notes" });
		await flush();
		expect(ran).toHaveBeenCalledTimes(1);
		expect(h.captureException).not.toHaveBeenCalled();
	});
});
