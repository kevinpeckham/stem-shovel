import { describe, expect, test } from "vite-plus/test";
import { obscureName } from "./obscureName";

describe("obscureName", () => {
	test("keeps the first letter and the last two", () => {
		expect(obscureName("MMKK")).toBe("M*KK");
		expect(obscureName("Mahony")).toBe("M***ny");
		expect(obscureName("Lightning Jar")).toBe("L******ng J*r");
	});
	test("short words", () => {
		expect(obscureName("Bob")).toBe("B*b");
		expect(obscureName("Al")).toBe("A*");
		expect(obscureName("X")).toBe("X");
	});
});
