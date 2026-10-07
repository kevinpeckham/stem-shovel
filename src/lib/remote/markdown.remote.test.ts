import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import { asSignedOut, call, httpError } from "../../../tests/helpers/fakeRequestEvent";
import { rateLimited, resetRemoteMocks } from "../../../tests/helpers/fakeServerModules";

/** renderPreview is open to visitors, limited by address. */
const markdown = await import("./markdown.remote");

beforeEach(resetRemoteMocks);

describe("renderPreview", () => {
	it("renders for a visitor, counted against their address", async () => {
		asSignedOut();
		await expect(call(markdown.renderPreview, "# Hi")).resolves.toBe("<p># Hi</p>");
		expect(rateLimited).toHaveBeenCalledWith("render:203.0.113.7", 60, 60_000);
	});
	it("429 once the limiter says so", async () => {
		asSignedOut();
		rateLimited.mockResolvedValue(true);
		await expect(call(markdown.renderPreview, "# Hi")).rejects.toMatchObject(httpError(429));
	});
	it("refuses more than the schema allows", async () => {
		asSignedOut();
		await expect(call(markdown.renderPreview, "x".repeat(50_001))).rejects.toThrow();
	});
});
