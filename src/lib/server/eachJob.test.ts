import { describe, expect, it, vi } from "vite-plus/test";

/** eachJob(): ids run in order, and one id's throw is logged and reported while the rest still run. */
const h = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@sentry/node", () => ({ captureException: h.captureException }));

const { eachJob } = await import("./eachJob");

describe("eachJob", () => {
	it("goes on to the third id after the second throws, and reports once", async () => {
		const logged = vi.spyOn(console, "error").mockImplementation(() => {});
		const boom = new Error("boom");
		const seen: string[] = [];
		await eachJob("mix", ["a", "b", "c"], async (id) => {
			seen.push(id);
			if (id === "b") throw boom;
		});
		expect(seen).toEqual(["a", "b", "c"]);
		expect(logged).toHaveBeenCalledWith("[jobs]", "mix", "b", boom);
		expect(h.captureException).toHaveBeenCalledTimes(1);
		expect(h.captureException).toHaveBeenCalledWith(boom, {
			tags: { job: "mix" },
			extra: { id: "b" },
		});
		logged.mockRestore();
	});
});
