import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { downloadBlob } from "./downloadBlob";

describe("downloadBlob", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});
	it("clicks a link to an object URL named as asked, without fetching, and revokes the URL a minute later", () => {
		vi.useFakeTimers();
		const a = { href: "", download: "", click: vi.fn() };
		vi.stubGlobal("document", { createElement: vi.fn(() => a) });
		const createObjectURL = vi.fn(() => "blob:local/7");
		const revokeObjectURL = vi.fn();
		vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
		const fetch = vi.fn();
		vi.stubGlobal("fetch", fetch);
		const blob = new Blob(["MThd"], { type: "audio/midi" });
		downloadBlob(blob, "Riff.mid");
		expect(createObjectURL).toHaveBeenCalledWith(blob);
		expect(a).toMatchObject({ href: "blob:local/7", download: "Riff.mid" });
		expect(a.click).toHaveBeenCalledTimes(1);
		expect(fetch).not.toHaveBeenCalled();
		expect(revokeObjectURL).not.toHaveBeenCalled();
		vi.advanceTimersByTime(60_000);
		expect(revokeObjectURL).toHaveBeenCalledWith("blob:local/7");
	});
});
