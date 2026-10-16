import { describe, expect, it } from "vite-plus/test";
import { vanityHostTarget } from "./vanityHostTarget";

describe("vanityHostTarget", () => {
	it("sends the chord player's domains, with or without www, to the chord player", () => {
		expect(vanityHostTarget("fifths.app")).toBe("https://www.stemshovel.com/palette");
		expect(vanityHostTarget("www.fifths.app")).toBe("https://www.stemshovel.com/palette");
		expect(vanityHostTarget("WWW.ChordPlayer.dev")).toBe("https://www.stemshovel.com/palette");
		expect(vanityHostTarget("chordplayer.dev:443")).toBe("https://www.stemshovel.com/palette");
	});
	it("leaves every other host alone", () => {
		expect(vanityHostTarget("www.stemshovel.com")).toBeNull();
		expect(vanityHostTarget("staging.stemshovel.dev")).toBeNull();
		expect(vanityHostTarget("localhost:5173")).toBeNull();
	});
});
