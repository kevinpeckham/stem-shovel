import { describe, expect, it } from "vite-plus/test";
import { permalink } from "./permalink";

describe("permalink", () => {
	it("addresses a thing by its kind and id", () => {
		expect(permalink("song", "abc")).toBe("/go/song/abc");
		expect(permalink("project", "p1")).toBe("/go/project/p1");
	});
	it("carries a trailing path without doubling the slash", () => {
		expect(permalink("account", "a1", "settings")).toBe("/go/account/a1/settings");
		expect(permalink("account", "a1", "/settings")).toBe("/go/account/a1/settings");
	});
	it("escapes an id that is not URL-safe", () => {
		expect(permalink("song", "a b")).toBe("/go/song/a%20b");
	});
});
