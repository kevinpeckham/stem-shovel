import { describe, expect, test } from "vite-plus/test";
import { robotsTxtAllows } from "./robotsTxtAllows";

const SITE = `# comment
User-agent: *
Allow: /$
Allow: /docs
Allow: /tuner$
Disallow: /docs/*/edit
Disallow: /
Sitemap: https://example.com/sitemap.xml
`;

describe("robotsTxtAllows", () => {
	test("a $ anchor matches the exact path only", () => {
		expect(robotsTxtAllows(SITE, "/")).toBe(true);
		expect(robotsTxtAllows(SITE, "/tuner")).toBe(true);
		expect(robotsTxtAllows(SITE, "/tuner/x")).toBe(false);
		expect(robotsTxtAllows(SITE, "/sign-in")).toBe(false);
	});
	test("an unanchored rule is a prefix", () => {
		expect(robotsTxtAllows(SITE, "/docs")).toBe(true);
		expect(robotsTxtAllows(SITE, "/docs/getting-started")).toBe(true);
		expect(robotsTxtAllows(SITE, "/docsx")).toBe(true);
	});
	test("a * wildcard spans characters, and the longer rule wins", () => {
		expect(robotsTxtAllows(SITE, "/docs/getting-started/edit")).toBe(false);
	});
	test("an Allow wins a tie of equal length", () => {
		expect(robotsTxtAllows("User-agent: *\nDisallow: /page\nAllow: /page\n", "/page")).toBe(true);
		expect(robotsTxtAllows("User-agent: *\nAllow: /page\nDisallow: /page\n", "/page")).toBe(true);
	});
	test("only the * group counts, and no group or no match allows", () => {
		const other = "User-agent: Googlebot\nDisallow: /\n";
		expect(robotsTxtAllows(other, "/x")).toBe(true);
		expect(robotsTxtAllows("", "/x")).toBe(true);
		expect(robotsTxtAllows("User-agent: *\nDisallow: /private\n", "/public")).toBe(true);
		expect(robotsTxtAllows("User-agent: *\nDisallow:\n", "/x")).toBe(true);
	});
	test("consecutive User-agent lines share a group", () => {
		const shared =
			"User-agent: Googlebot\nUser-agent: *\nDisallow: /\n\nUser-agent: Bingbot\nAllow: /\n";
		expect(robotsTxtAllows(shared, "/x")).toBe(false);
	});
	test("non-production: everything is disallowed", () => {
		expect(robotsTxtAllows("User-agent: *\nDisallow: /\n", "/")).toBe(false);
	});
});
