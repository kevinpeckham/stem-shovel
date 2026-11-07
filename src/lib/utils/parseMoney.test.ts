import { describe, expect, test } from "vite-plus/test";
import { parseMoney } from "./parseMoney";

describe("parseMoney", () => {
	test("whole and decimal amounts as cents", () => {
		expect(parseMoney("450")).toBe(45000);
		expect(parseMoney("450.5")).toBe(45050);
		expect(parseMoney("450.50")).toBe(45050);
		expect(parseMoney("0.07")).toBe(7);
		expect(parseMoney(".5")).toBe(50);
		expect(parseMoney("12.")).toBe(1200);
		expect(parseMoney("0")).toBe(0);
	});
	test("a currency sign, thousands commas and spaces are ignored", () => {
		expect(parseMoney("$1,234.50")).toBe(123450);
		expect(parseMoney(" $ 300 ")).toBe(30000);
		expect(parseMoney("1,000,000")).toBe(100000000);
	});
	test("negative amounts", () => {
		expect(parseMoney("-20")).toBe(-2000);
		expect(parseMoney("-$20.25")).toBe(-2025);
		expect(parseMoney("$-20")).toBe(-2000);
		expect(parseMoney("-0")).toBe(0);
	});
	test("null when it does not read as an amount", () => {
		expect(parseMoney(" 12.345 ")).toBeNull();
		expect(parseMoney("abc")).toBeNull();
		expect(parseMoney("")).toBeNull();
		expect(parseMoney("-")).toBeNull();
		expect(parseMoney(".")).toBeNull();
		expect(parseMoney("1,23")).toBeNull();
		expect(parseMoney("12-")).toBeNull();
		expect(parseMoney("1".repeat(13))).toBeNull();
	});
});
