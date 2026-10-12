import { describe, expect, it } from "vite-plus/test";
import { stemPlaybackMode } from "./stemPlaybackMode";

describe("stemPlaybackMode", () => {
	const base = { estimate: 100, budget: 1000, choice: null, site: "auto" as const, capable: true };
	it("buffers a small song and streams one past the budget", () => {
		expect(stemPlaybackMode(base)).toBe("buffered");
		expect(stemPlaybackMode({ ...base, estimate: 2000 })).toBe("streamed");
	});
	it("the listener's choice wins, then the site's always", () => {
		expect(stemPlaybackMode({ ...base, choice: "streamed" })).toBe("streamed");
		expect(stemPlaybackMode({ ...base, estimate: 2000, choice: "buffered" })).toBe("buffered");
		expect(stemPlaybackMode({ ...base, site: "always" })).toBe("streamed");
		expect(stemPlaybackMode({ ...base, site: "always", choice: "buffered" })).toBe("buffered");
	});
	it("never streams where the browser cannot", () => {
		expect(stemPlaybackMode({ ...base, estimate: 2000, capable: false })).toBe("buffered");
		expect(stemPlaybackMode({ ...base, choice: "streamed", capable: false })).toBe("buffered");
	});
});
