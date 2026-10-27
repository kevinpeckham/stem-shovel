import { describe, expect, it } from "vite-plus/test";
import { plural } from "./plural";

describe("plural", () => {
	it("adds an s except for exactly one", () => {
		expect(plural(0, "song")).toBe("0 songs");
		expect(plural(1, "song")).toBe("1 song");
		expect(plural(2, "song")).toBe("2 songs");
	});
	it("takes an irregular plural", () => {
		expect(plural(3, "person", "people")).toBe("3 people");
	});
});
