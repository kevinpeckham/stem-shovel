import { describe, expect, it } from "vite-plus/test";
import { shortLinkHostRoute } from "./shortLinkHostRoute";

const site = "https://www.stemshovel.com";
const short = "https://shvl.me";
const at = (u: string) => new URL(u);

describe("shortLinkHostRoute", () => {
	it("reads the code off the short domain, with or without www, any port or trailing slash", () => {
		expect(shortLinkHostRoute(at("https://shvl.me/AbCd2345"), short, site)).toEqual({
			code: "AbCd2345",
		});
		expect(shortLinkHostRoute(at("https://www.shvl.me/AbCd2345/"), short, site)).toEqual({
			code: "AbCd2345",
		});
		expect(shortLinkHostRoute(at("http://shvl.me:3000/AbCd2345"), short, site)).toEqual({
			code: "AbCd2345",
		});
	});
	it("marks every other path on the short domain as no code", () => {
		expect(shortLinkHostRoute(at("https://shvl.me/"), short, site)).toEqual({ code: null });
		expect(shortLinkHostRoute(at("https://shvl.me/x/AbCd2345"), short, site)).toEqual({
			code: null,
		});
		expect(shortLinkHostRoute(at("https://shvl.me/piano"), short, site)).toEqual({ code: null });
		// 0, O, 1, l and I are not in the alphabet; the length is fixed.
		expect(shortLinkHostRoute(at("https://shvl.me/AbCd0345"), short, site)).toEqual({ code: null });
		expect(shortLinkHostRoute(at("https://shvl.me/AbCd23456"), short, site)).toEqual({
			code: null,
		});
	});
	it("leaves every other host alone", () => {
		expect(shortLinkHostRoute(at("https://www.stemshovel.com/AbCd2345"), short, site)).toBeNull();
		expect(shortLinkHostRoute(at("http://localhost:5173/AbCd2345"), short, site)).toBeNull();
	});
	it("does nothing without a short domain, or with one that is the site itself", () => {
		expect(shortLinkHostRoute(at("https://shvl.me/AbCd2345"), undefined, site)).toBeNull();
		expect(shortLinkHostRoute(at("https://shvl.me/AbCd2345"), "", site)).toBeNull();
		expect(shortLinkHostRoute(at("https://www.stemshovel.com/AbCd2345"), site, site)).toBeNull();
		expect(shortLinkHostRoute(at("https://shvl.me/AbCd2345"), "nonsense", site)).toBeNull();
	});
});
