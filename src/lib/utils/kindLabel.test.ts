import { describe, expect, test } from "vite-plus/test";
import { kindLabel } from "./kindLabel";

describe("kindLabel", () => {
	test("singular for one", () => {
		expect(kindLabel("comment", 1)).toBe("1 comment");
		expect(kindLabel("chat", 1)).toBe("1 chat message");
	});
	test("plural otherwise", () => {
		expect(kindLabel("comment", 3)).toBe("3 comments");
		expect(kindLabel("mix", 2)).toBe("2 mixes");
		expect(kindLabel("session", 0)).toBe("0 sessions");
	});
	test("an unknown kind counts as notifications", () => {
		expect(kindLabel("something-new", 2)).toBe("2 notifications");
	});
});
