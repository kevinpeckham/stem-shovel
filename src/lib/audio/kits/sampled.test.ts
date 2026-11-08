import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const captureException = vi.fn();
vi.mock("@sentry/sveltekit", () => ({ captureException }));

import { SampledKit } from "./sampled";

/** A context that "decodes" any bytes to a stand-in buffer. */
const ctx = {
	decodeAudioData: vi.fn(async () => ({}) as AudioBuffer),
} as unknown as BaseAudioContext;

describe("SampledKit", () => {
	const unhandled = vi.fn();
	beforeEach(() => {
		captureException.mockClear();
		process.on("unhandledRejection", unhandled);
		// Every voice but the snare is there: the snare 404s.
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) =>
				url.endsWith("/snare.wav")
					? new Response("not found", { status: 404 })
					: new Response(new ArrayBuffer(8), { status: 200 }),
			),
		);
	});
	afterEach(() => {
		process.off("unhandledRejection", unhandled);
		vi.unstubAllGlobals();
		unhandled.mockClear();
	});

	it("reports a missing sample and still loads the other voices", async () => {
		const kit = new SampledKit("acoustic", null, true);
		await expect(kit.load(ctx)).resolves.toBeUndefined();
		await vi.waitFor(() => expect(captureException).toHaveBeenCalledTimes(1));
		const [error, context] = captureException.mock.calls[0]!;
		expect((error as Error).message).toBe("snare: 404");
		expect(context.extra).toEqual({ kit: "acoustic", voice: "snare", url: "/kits/acoustic/snare.wav" });
		const out = {} as AudioNode;
		expect(kit.play("snare", ctx, 0, 1, out)).toBeNull();
	});

	it("leaves no unhandled rejection when the kit is only warmed", async () => {
		new SampledKit("future", null, true).warm();
		await new Promise((r) => setTimeout(r, 20));
		expect(unhandled).not.toHaveBeenCalled();
		await vi.waitFor(() => expect(captureException).toHaveBeenCalledTimes(1));
	});
});
