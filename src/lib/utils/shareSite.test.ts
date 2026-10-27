import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const notify = vi.fn();
vi.mock("#lib/state/notifications.svelte.js", () => ({
	notify: (...a: unknown[]) => notify(...a),
}));

const { shareSite } = await import("./shareSite");

const SITE = { title: "Stem Shovel", url: "https://www.stemshovel.com" };

describe("shareSite", () => {
	const writeText = vi.fn();
	const share = vi.fn();
	const withNavigator = (value: object) =>
		Object.defineProperty(globalThis, "navigator", { value, configurable: true });
	beforeEach(() => {
		notify.mockReset();
		writeText.mockReset();
		share.mockReset();
	});

	it("opens the share sheet where there is one", async () => {
		withNavigator({ share, clipboard: { writeText } });
		share.mockResolvedValue(undefined);
		await shareSite();
		expect(share).toHaveBeenCalledWith(SITE);
		expect(writeText).not.toHaveBeenCalled();
		expect(notify).not.toHaveBeenCalled();
	});

	it("dismissing the sheet says nothing", async () => {
		withNavigator({ share, clipboard: { writeText } });
		share.mockRejectedValue(new DOMException("cancelled", "AbortError"));
		await shareSite();
		expect(notify).not.toHaveBeenCalled();
	});

	it("copies the address without a share sheet", async () => {
		withNavigator({ clipboard: { writeText } });
		writeText.mockResolvedValue(undefined);
		await shareSite();
		expect(writeText).toHaveBeenCalledWith(SITE.url);
		expect(notify).toHaveBeenCalledWith("Link copied");
	});

	it("a refused copy is an error", async () => {
		withNavigator({ clipboard: { writeText } });
		writeText.mockRejectedValue(new Error("denied"));
		await shareSite();
		expect(notify).toHaveBeenCalledWith("Could not share the link: denied", { kind: "error" });
	});
});
