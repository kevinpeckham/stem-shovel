import { describe, expect, it } from "vite-plus/test";
import * as v from "valibot";
import { SHORT_LINK_MAX_TARGET, ShortLinkCodeSchema, ShortLinkMintSchema } from "./ShortLinkSchema";

const ok = (schema: v.GenericSchema, input: unknown) => v.safeParse(schema, input).success;

describe("ShortLinkCodeSchema", () => {
	it("is eight characters from the unambiguous alphabet", () => {
		expect(v.parse(ShortLinkCodeSchema, "Ab2kZz9y")).toBe("Ab2kZz9y");
		expect(ok(ShortLinkCodeSchema, "Ab2kZz9")).toBe(false);
		expect(ok(ShortLinkCodeSchema, "Ab2kZz9yQ")).toBe(false);
		for (const confusable of ["0", "O", "1", "l", "I", "-"]) {
			expect(ok(ShortLinkCodeSchema, `Ab2kZz9${confusable}`)).toBe(false);
		}
	});
});

describe("ShortLinkMintSchema", () => {
	const mint = { target: "/piano?x=1#preset=abc", kind: "piano" };
	const longest = "/".padEnd(SHORT_LINK_MAX_TARGET, "a");
	it("takes a path on this site, query and hash included, with a kind", () => {
		expect(v.parse(ShortLinkMintSchema, mint)).toEqual(mint);
		expect(ok(ShortLinkMintSchema, { ...mint, target: longest })).toBe(true);
	});
	it("refuses anything that could leave the site, a too-long target or an unknown kind", () => {
		const bad = [
			"",
			"//evil.example",
			"https://evil.example/",
			"piano",
			"/a\\b",
			"/a\nb",
			"/a\x7fb",
		];
		for (const target of bad) expect(ok(ShortLinkMintSchema, { ...mint, target })).toBe(false);
		expect(ok(ShortLinkMintSchema, { ...mint, target: `${longest}a` })).toBe(false);
		expect(ok(ShortLinkMintSchema, { ...mint, kind: "beat" })).toBe(false);
	});
});
