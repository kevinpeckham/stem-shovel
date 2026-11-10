import { describe, expect, test } from "vite-plus/test";
import { meterInForceAt } from "./meterInForceAt.js";

describe("meterInForceAt", () => {
	const rows = [
		{ kind: "tempo", start: 0, value: "120" },
		{ kind: "meter", start: 0, value: "6/8" },
		{ kind: "meter", start: 30, value: "4/4" },
		{ kind: "key", start: 40, value: "D" },
	];

	test("the latest meter at or before the time; the meter row wins a tie", () => {
		expect(meterInForceAt(rows, 0)).toBe("6/8");
		expect(meterInForceAt(rows, 29.9)).toBe("6/8");
		expect(meterInForceAt(rows, 30)).toBe("4/4");
		expect(meterInForceAt(rows, 100)).toBe("4/4");
	});

	test("null before the first meter, or with none", () => {
		expect(meterInForceAt([{ kind: "meter", start: 5, value: "3/4" }], 1)).toBeNull();
		expect(meterInForceAt([{ kind: "tempo", start: 0, value: "90" }], 0)).toBeNull();
		expect(meterInForceAt([], 0)).toBeNull();
	});

	test("the editor's seconds, or a resolver; rows without a time are ignored", () => {
		expect(
			meterInForceAt(
				[
					{ kind: "meter", seconds: 0, value: "3/4" },
					{ kind: "meter", seconds: null, value: "6/8" },
				],
				10,
			),
		).toBe("3/4");
		const typed = [
			{ kind: "meter", time: "0:00", value: "4/4" },
			{ kind: "meter", time: "0:10", value: "12/8" },
			{ kind: "meter", time: "soon", value: "5/4" },
		];
		const parse = (r: { time: string }) =>
			/^0:(\d\d)$/.test(r.time) ? Number(r.time.slice(2)) : null;
		expect(meterInForceAt(typed, 12, parse)).toBe("12/8");
		expect(meterInForceAt(typed, 5, parse)).toBe("4/4");
	});

	test("two meters at the same instant: the later row wins", () => {
		expect(
			meterInForceAt(
				[
					{ kind: "meter", start: 0, value: "4/4" },
					{ kind: "meter", start: 0, value: "6/8" },
				],
				0,
			),
		).toBe("6/8");
	});
});
