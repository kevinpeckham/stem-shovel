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
	it("reads a custom address as typed, capitals included, for the lookup to lower", () => {
		expect(shortLinkHostRoute(at("https://shvl.me/my-band"), short, site)).toEqual({
			code: "my-band",
		});
		expect(shortLinkHostRoute(at("https://shvl.me/My-Band/"), short, site)).toEqual({
			code: "My-Band",
		});
	});
	it("reads the app's /x/ form pasted onto the short domain, in either case", () => {
		expect(shortLinkHostRoute(at("https://shvl.me/x/AbCd2345"), short, site)).toEqual({
			code: "AbCd2345",
		});
		expect(shortLinkHostRoute(at("https://shvl.me/X/AbCd2345"), short, site)).toEqual({
			code: "AbCd2345",
		});
		expect(shortLinkHostRoute(at("https://shvl.me/X/my-band"), short, site)).toEqual({
			code: "my-band",
		});
	});
	it("marks every other path on the short domain as no code", () => {
		expect(shortLinkHostRoute(at("https://shvl.me/"), short, site)).toEqual({ code: null });
		expect(shortLinkHostRoute(at("https://shvl.me/x/"), short, site)).toEqual({ code: null });
		expect(shortLinkHostRoute(at("https://shvl.me/a/AbCd2345"), short, site)).toEqual({
			code: null,
		});
		// Reserved words are no one's address: the page's own name is not a link.
		expect(shortLinkHostRoute(at("https://shvl.me/piano"), short, site)).toEqual({ code: null });
		expect(shortLinkHostRoute(at("https://shvl.me/x/admin"), short, site)).toEqual({ code: null });
		expect(shortLinkHostRoute(at("https://shvl.me/-tour"), short, site)).toEqual({ code: null });
		// Neither a code nor a slug: an underscore, a dot, or past a slug's 32 characters.
		expect(shortLinkHostRoute(at("https://shvl.me/AbCd_345"), short, site)).toEqual({ code: null });
		expect(shortLinkHostRoute(at("https://shvl.me/robots.txt"), short, site)).toEqual({
			code: null,
		});
		expect(shortLinkHostRoute(at(`https://shvl.me/${"a".repeat(33)}`), short, site)).toEqual({
			code: null,
		});
	});
	it("passes a code-like shape outside the alphabet on as a possible slug, for the lookup to miss", () => {
		expect(shortLinkHostRoute(at("https://shvl.me/AbCd0345"), short, site)).toEqual({
			code: "AbCd0345",
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
