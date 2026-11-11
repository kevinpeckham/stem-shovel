import { describe, expect, it } from "vite-plus/test";
import * as v from "valibot";
import { ChartColumnsChangeSchema } from "./ChartColumnsChangeSchema";

const id = "V1StGXR8_Z5jdHi6B-myT";
const ok = (input: unknown) => v.safeParse(ChartColumnsChangeSchema, input).success;

describe("ChartColumnsChangeSchema", () => {
	it("takes shared or row, nothing else", () => {
		expect(ok({ id, columns: "shared" })).toBe(true);
		expect(ok({ id, columns: "row" })).toBe(true);
		expect(ok({ id, columns: "bar" })).toBe(false);
		expect(ok({ id })).toBe(false);
	});
});
