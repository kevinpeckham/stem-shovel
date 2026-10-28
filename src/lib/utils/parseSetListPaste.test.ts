import { describe, expect, test } from "vite-plus/test";
import { MAX_SET_LIST_ITEMS } from "#lib/val/SetListSchema.js";
import { parseSetListPaste } from "./parseSetListPaste";

describe("parseSetListPaste", () => {
	test("one line per row, blank lines and edge spaces dropped, any line ending", () => {
		expect(parseSetListPaste("  Interbellum \r\n\r\n\nBreak\rEncore\n   \n")).toEqual([
			"Interbellum",
			"Break",
			"Encore",
		]);
	});
	test("numbering and bullets are ignored", () => {
		expect(
			parseSetListPaste(
				[
					"1. One",
					"2) Two",
					"03 - Three",
					"4: Four",
					"5- Five",
					"- Six",
					"* Seven",
					"• Eight",
					"– Nine",
					"— Ten",
					"# Eleven",
					"12.Twelve",
				].join("\n"),
			),
		).toEqual([
			"One",
			"Two",
			"Three",
			"Four",
			"Five",
			"Six",
			"Seven",
			"Eight",
			"Nine",
			"Ten",
			"Eleven",
			"Twelve",
		]);
	});
	test("only one marker goes, and numbers that are part of a title stay", () => {
		expect(
			parseSetListPaste("1. 99 Problems\n7-Eleven\n1.5 Hours\n10 Years Gone\n#1 Crush\n*NSYNC"),
		).toEqual(["99 Problems", "7-Eleven", "1.5 Hours", "10 Years Gone", "#1 Crush", "*NSYNC"]);
	});
	test("a line that is only a marker is dropped", () => {
		expect(parseSetListPaste("1.\n-\nSong")).toEqual(["Song"]);
	});
	test("inner spacing collapses", () => {
		expect(parseSetListPaste("Long \t  Road   Home")).toEqual(["Long Road Home"]);
	});
	test("a line is cut to 120 characters", () => {
		const [line] = parseSetListPaste(`1. ${"a".repeat(130)}`);
		expect(line).toBe("a".repeat(120));
	});
	test(`no more than ${MAX_SET_LIST_ITEMS} lines`, () => {
		const text = Array.from({ length: MAX_SET_LIST_ITEMS + 5 }, (_, i) => `Song ${i}`).join("\n");
		const lines = parseSetListPaste(text);
		expect(lines).toHaveLength(MAX_SET_LIST_ITEMS);
		expect(lines.at(-1)).toBe(`Song ${MAX_SET_LIST_ITEMS - 1}`);
	});
	test("nothing for empty text", () => {
		expect(parseSetListPaste("")).toEqual([]);
		expect(parseSetListPaste(" \n\t\n")).toEqual([]);
	});
});
