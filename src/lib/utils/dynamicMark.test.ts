import { describe, expect, it } from "vite-plus/test";
import { dynamicMark } from "./dynamicMark";

describe("dynamicMark", () => {
	it("reads a level as a dynamic marking", () => {
		expect(dynamicMark(0.2)).toBe("pp");
		expect(dynamicMark(0.4)).toBe("p");
		expect(dynamicMark(0.5)).toBe("mp");
		expect(dynamicMark(0.7)).toBe("mf");
		expect(dynamicMark(0.8)).toBe("f");
		expect(dynamicMark(1)).toBe("ff");
	});
});
