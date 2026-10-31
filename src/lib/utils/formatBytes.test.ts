import { describe, expect, test } from "vite-plus/test";
import { formatBytes } from "./formatBytes";

describe("formatBytes", () => {
	test("KB below a megabyte, MB with one decimal above", () => {
		expect(formatBytes(48945)).toBe("48 KB");
		expect(formatBytes(10485760)).toBe("10.0 MB");
	});
});
