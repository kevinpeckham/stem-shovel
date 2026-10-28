import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { imageThumbnail } from "./imageThumbnail";

/**
 * Node (and jsdom) has neither `createImageBitmap` nor a canvas that draws, so the
 * happy path (a WebP at most 640 px on its longer edge, the original's
 * size reported) is exercised in the browser only; here, the ways it
 * answers null so the upload goes on without a thumbnail.
 */
const file = new File(["not an image"], "photo.jpg", { type: "image/jpeg" });

describe("imageThumbnail", () => {
	afterEach(() => vi.unstubAllGlobals());

	test("a file the browser cannot decode gives null", async () => {
		vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("undecodable")));
		expect(await imageThumbnail(file)).toBeNull();
	});

	test("no 2D context gives null and the bitmap is released", async () => {
		const close = vi.fn();
		vi.stubGlobal(
			"createImageBitmap",
			vi.fn().mockResolvedValue({ width: 1200, height: 800, close }),
		);
		vi.stubGlobal("document", { createElement: () => ({ getContext: () => null }) });
		expect(await imageThumbnail(file)).toBeNull();
		expect(close).toHaveBeenCalled();
	});
});
