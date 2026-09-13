import { describe, expect, test } from "vite-plus/test";
import { bumpVersion } from "./bumpVersion";

describe("bumpVersion", () => {
	test("bumps one level and resets the ones below", () => {
		expect(bumpVersion("0.0.1", "patch")).toBe("0.0.2");
		expect(bumpVersion("0.0.9", "minor")).toBe("0.1.0");
		expect(bumpVersion("1.4.2", "major")).toBe("2.0.0");
		expect(bumpVersion(" 1.4.2 ", "patch")).toBe("1.4.3");
	});
	test("starts over from 0.0.1 when the input is not a version", () => {
		expect(bumpVersion("v2", "patch")).toBe("0.0.1");
		expect(bumpVersion("", "major")).toBe("0.0.1");
	});
});
