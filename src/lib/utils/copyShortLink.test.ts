import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const shorten = vi.fn();
const notify = vi.fn();
vi.mock("./shortenShareLink", () => ({ shortenShareLink: (...a: unknown[]) => shorten(...a) }));
vi.mock("#lib/state/notifications.svelte.js", () => ({
	notify: (...a: unknown[]) => notify(...a),
}));

const { copyShortLink } = await import("./copyShortLink");

describe("copyShortLink", () => {
	const writeText = vi.fn();
	beforeEach(() => {
		shorten.mockReset();
		notify.mockReset();
		writeText.mockReset();
		Object.defineProperty(globalThis, "navigator", {
			value: { clipboard: { writeText } },
			configurable: true,
		});
	});

	it("copies the short address and says so", async () => {
		shorten.mockResolvedValue("https://shvl.me/abc");
		writeText.mockResolvedValue(undefined);
		expect(await copyShortLink("https://x.test/a/b", "song")).toBe(true);
		expect(shorten).toHaveBeenCalledWith("https://x.test/a/b", "song");
		expect(writeText).toHaveBeenCalledWith("https://shvl.me/abc");
		expect(notify).toHaveBeenCalledWith("Short link copied");
	});

	it("copies the long address when no code came, with the plain message", async () => {
		shorten.mockResolvedValue("https://x.test/a/b");
		writeText.mockResolvedValue(undefined);
		expect(await copyShortLink("https://x.test/a/b", "project")).toBe(true);
		expect(writeText).toHaveBeenCalledWith("https://x.test/a/b");
		expect(notify).toHaveBeenCalledWith("Link copied");
	});

	it("reports a clipboard refusal as an error", async () => {
		shorten.mockResolvedValue("https://shvl.me/abc");
		writeText.mockRejectedValue(new Error("denied"));
		expect(await copyShortLink("https://x.test/a/b", "song")).toBe(false);
		expect(notify).toHaveBeenCalledWith("Could not copy the link", { kind: "error" });
	});
});
