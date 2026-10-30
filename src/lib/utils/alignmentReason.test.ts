import { describe, expect, test } from "vite-plus/test";
import { alignmentReason } from "./alignmentReason.js";

describe("alignmentReason", () => {
	test("a sentence for each reason", () => {
		expect(alignmentReason("none")).toBe("Write the song's chart or attach its score first.");
		expect(alignmentReason("musicxml")).toBe(
			"Alignment reads a chart read or the chord chart; this score is MusicXML, which it cannot read yet.",
		);
		expect(alignmentReason("unread")).toBe(
			"The score has not been read yet: run Ask AI to check first, which reads it.",
		);
		expect(alignmentReason("no-bars")).toBe(
			"The chart has no bars to place: it needs a tempo and chord symbols.",
		);
		expect(alignmentReason("audio")).toBe(
			"The stems are still decoding; try again when the player is ready.",
		);
	});
});
