import { describe, expect, test } from "vite-plus/test";
import { shareLinkAim } from "./shareLinkAim";

describe("shareLinkAim", () => {
	test("a mix, a demo, or the song itself", () => {
		expect(shareLinkAim({ mixId: "m1", demoId: null })).toBe("mix");
		expect(shareLinkAim({ mixId: null, demoId: "d1" })).toBe("demo");
		expect(shareLinkAim({ mixId: null, demoId: null })).toBeNull();
		expect(shareLinkAim({})).toBeNull();
	});
});
