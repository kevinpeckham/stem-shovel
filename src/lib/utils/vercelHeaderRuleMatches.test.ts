import { describe, expect, test } from "vite-plus/test";
import vercel from "../../../vercel.json" with { type: "json" };
import { vercelHeaderRuleMatches, type VercelHeaderRule } from "./vercelHeaderRuleMatches";

const rules = vercel.headers as VercelHeaderRule[];

describe("vercelHeaderRuleMatches", () => {
	test("vercel.json's X-Robots-Tag rule exempts the public pages", () => {
		expect(vercelHeaderRuleMatches(rules, "/multitrack-recorder/features")).toBe(false);
		expect(vercelHeaderRuleMatches(rules, "/docs/foo")).toBe(false);
		expect(vercelHeaderRuleMatches(rules, "/tuner")).toBe(false);
		expect(vercelHeaderRuleMatches(rules, "/")).toBe(false);
	});
	test("and noindexes the app", () => {
		expect(vercelHeaderRuleMatches(rules, "/settings/links")).toBe(true);
		expect(vercelHeaderRuleMatches(rules, "/tuner/x")).toBe(true);
		// The `$` anchors exempt the exact public path alone; anything under it is still the app.
		expect(vercelHeaderRuleMatches(rules, "/multitrack-recorder")).toBe(false);
		expect(vercelHeaderRuleMatches(rules, "/multitrack-recorder/x")).toBe(true);
	});
	test("path-to-regexp parameters", () => {
		const r = [{ source: "/a/:id/:rest*", headers: [{ key: "x-robots-tag", value: "noindex" }] }];
		expect(vercelHeaderRuleMatches(r, "/a/1/b/c")).toBe(true);
		expect(vercelHeaderRuleMatches(r, "/b/1")).toBe(false);
	});
	test("no rule sets the header: false", () => {
		expect(vercelHeaderRuleMatches([{ source: "/(.*)", headers: [] }], "/x")).toBe(false);
	});
});
