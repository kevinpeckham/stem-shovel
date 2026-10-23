import { describe, expect, it } from "vite-plus/test";
import { colourOfHex } from "./colourOfHex";

describe("colourOfHex", () => {
	it("gives a palette color back as its tint, keeps any other as it is, and nothing for nonsense", () => {
		expect(colourOfHex("#7FB2C2")).toBe("sea");
		expect(colourOfHex("c98a9c")).toBe("rose");
		expect(colourOfHex("#FF5706")).toBe("#ff5706");
		expect(colourOfHex("#a2eabfff")).toBeUndefined();
		expect(colourOfHex(null)).toBeUndefined();
	});
});
