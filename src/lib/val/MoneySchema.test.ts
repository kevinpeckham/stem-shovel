import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";
import { CountSchema, MoneyRequiredSchema, MoneySchema } from "./MoneySchema";

const messages = (schema: v.GenericSchema, input: unknown) =>
	v.safeParse(schema, input).issues?.map((i) => i.message) ?? [];

describe("MoneySchema", () => {
	test("an amount as cents, trimmed", () => {
		expect(v.parse(MoneySchema, "450")).toBe(45000);
		expect(v.parse(MoneySchema, " 450.50 ")).toBe(45050);
		expect(v.parse(MoneySchema, "$1,234.50")).toBe(123450);
		expect(v.parse(MoneySchema, "-20")).toBe(-2000);
	});
	test("empty is null: not known", () => {
		expect(v.parse(MoneySchema, "")).toBeNull();
		expect(v.parse(MoneySchema, "   ")).toBeNull();
	});
	test("refuses what does not read as an amount, with the message", () => {
		expect(messages(MoneySchema, "abc")).toEqual(["Enter an amount like 450 or 450.50"]);
		expect(messages(MoneySchema, "12.345")).toEqual(["Enter an amount like 450 or 450.50"]);
		expect(v.safeParse(MoneySchema, 450).success).toBe(false);
	});
});

describe("MoneyRequiredSchema", () => {
	test("an amount as cents", () => {
		expect(v.parse(MoneyRequiredSchema, "75")).toBe(7500);
		expect(v.parse(MoneyRequiredSchema, "-12.5")).toBe(-1250);
	});
	test("refuses empty and a bad amount, each with its message", () => {
		expect(messages(MoneyRequiredSchema, " ")).toEqual(["Enter the amount"]);
		expect(messages(MoneyRequiredSchema, "lots")).toEqual(["Enter an amount like 450 or 450.50"]);
	});
});

describe("CountSchema", () => {
	test("a whole number, or null for empty", () => {
		expect(v.parse(CountSchema, "0")).toBe(0);
		expect(v.parse(CountSchema, " 212 ")).toBe(212);
		expect(v.parse(CountSchema, "1000000")).toBe(1_000_000);
		expect(v.parse(CountSchema, "")).toBeNull();
	});
	test("refuses fractions, negatives, words and more than a million", () => {
		for (const bad of ["1.5", "-3", "lots", "1000001", "1e3", "12345678"])
			expect(messages(CountSchema, bad)).toEqual(["Enter a whole number"]);
	});
});
