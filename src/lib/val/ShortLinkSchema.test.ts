import { describe, expect, it } from "vite-plus/test";
import * as v from "valibot";
import { readdirSync } from "node:fs";
import {
	SHORT_LINK_MAX_TARGET,
	SHORT_LINK_RESERVED_SLUGS,
	ShortLinkAddressSchema,
	ShortLinkCodeSchema,
	ShortLinkMintSchema,
	ShortLinkSlugFormSchema,
	ShortLinkSlugSchema,
} from "./ShortLinkSchema";

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

describe("ShortLinkSlugSchema", () => {
	it("takes 3 to 32 lowercase letters, digits and hyphens, lowering and trimming what is typed", () => {
		for (const slug of ["abc", "my-band", "a1b", "2026-tour", "a".repeat(32)])
			expect(v.parse(ShortLinkSlugSchema, slug)).toBe(slug);
		expect(v.parse(ShortLinkSlugSchema, "  My-Band ")).toBe("my-band");
	});
	it("refuses the wrong length, other characters and hyphens at either end", () => {
		for (const slug of [
			"ab",
			"a".repeat(33),
			"-abc",
			"abc-",
			"my band",
			"my_band",
			"café",
			"a/b",
			"",
		])
			expect(ok(ShortLinkSlugSchema, slug)).toBe(false);
	});
	it("refuses the reserved words, in any case", () => {
		for (const slug of ["admin", "Settings", "sign-in", "piano", "api", "www", "docs"])
			expect(ok(ShortLinkSlugSchema, slug)).toBe(false);
	});
	it("reserves every first segment of src/routes that could be a slug", () => {
		const segments = readdirSync(new URL("../../routes", import.meta.url), { withFileTypes: true })
			.filter((d) => d.isDirectory() && /^[a-z0-9-]+$/.test(d.name))
			.map((d) => d.name);
		expect(segments.length).toBeGreaterThan(10);
		for (const segment of segments) expect(SHORT_LINK_RESERVED_SLUGS).toContain(segment);
	});
	it("the form takes a link id and lowers the slug", () => {
		const linkId = "a".repeat(21);
		expect(v.parse(ShortLinkSlugFormSchema, { linkId, slug: "Tour" })).toEqual({
			linkId,
			slug: "tour",
		});
		expect(ok(ShortLinkSlugFormSchema, { linkId: "x y", slug: "tour" })).toBe(false);
	});
});

describe("ShortLinkAddressSchema", () => {
	it("is a code, or a slug in any case", () => {
		for (const address of ["Ab2kZz9y", "my-band", "My-Band", "abc"])
			expect(ok(ShortLinkAddressSchema, address)).toBe(true);
	});
	it("is not a reserved word, a path or a malformed slug", () => {
		for (const address of ["piano", "Admin", "x", "ab", "a/b", "-abc", ""])
			expect(ok(ShortLinkAddressSchema, address)).toBe(false);
	});
});
