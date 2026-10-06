import { describe, expect, it } from "vite-plus/test";
import { shortLinkUrl } from "./shortLinkUrl";

describe("shortLinkUrl", () => {
	it("uses the short domain when it is configured", () => {
		expect(shortLinkUrl("AbCd2345", "https://shvl.me", "https://www.stemshovel.com")).toBe(
			"https://shvl.me/AbCd2345",
		);
		expect(shortLinkUrl("AbCd2345", "https://shvl.me/", "https://www.stemshovel.com")).toBe(
			"https://shvl.me/AbCd2345",
		);
	});
	it("falls back to /x/<code> on the app's origin", () => {
		expect(shortLinkUrl("AbCd2345", undefined, "https://staging.stemshovel.dev")).toBe(
			"https://staging.stemshovel.dev/x/AbCd2345",
		);
		expect(shortLinkUrl("AbCd2345", "", "http://localhost:5173/")).toBe(
			"http://localhost:5173/x/AbCd2345",
		);
	});
});
