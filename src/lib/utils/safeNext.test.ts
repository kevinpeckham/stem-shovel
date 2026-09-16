import { describe, expect, test } from "vite-plus/test";
import { safeNext } from "./safeNext";

describe("safeNext", () => {
	test("keeps a path on this site", () => {
		expect(safeNext("/mmkk/projects?x=1")).toBe("/mmkk/projects?x=1");
	});
	test("refuses off-site and protocol-relative targets", () => {
		expect(safeNext("https://evil.example")).toBe("/");
		expect(safeNext("//evil.example/x")).toBe("/");
		expect(safeNext("/\\evil.example")).toBe("/");
		expect(safeNext("")).toBe("/");
		expect(safeNext(null, "/docs")).toBe("/docs");
	});
});
