import { describe, expect, it } from "vite-plus/test";
import { parseTextToChordsReply } from "./parseTextToChordsReply";

describe("parseTextToChordsReply", () => {
	it("reads the chart and returns barmark's canonical print", () => {
		const r = parseTextToChordsReply(
			`Here you go:\n{"name":"Doo-wop","style":"jazz","note":"Round.","chart":"key: Eb\\ntime: 4/4\\ntempo: 110\\n\\n## Doo-wop\\n| Eb   Cm | Abmaj7 Bb7 |"}`,
		);
		expect(r.name).toBe("Doo-wop");
		expect(r.note).toBe("Round.");
		expect(r.style).toBe("jazz");
		expect(r.chart).toContain("key: Eb");
		expect(r.chart).toContain("| Eb Cm | Abmaj7 Bb7 |");
		expect(parseTextToChordsReply(`{"chart":"| C |"}`).name).toBe("From a description");
	});
	it("reads the player's setup, percentages to levels, nulls left out", () => {
		const r = parseTextToChordsReply(
			`{"chart":"| C |","setup":{"mode":"chords","sound":"epiano","voicing":"rich","strum":"slow","strumPattern":"folk","arp":{"on":true,"rate":"16","gate":60,"swing":25,"latch":null},"octave":3,"sustain":true,"effects":{"reverb":40,"delay":null,"chorus":20}}}`,
		);
		expect(r.setup).toEqual({
			mode: "chords",
			instrument: "epiano",
			voicing: "rich",
			strum: "slow",
			strumPattern: "folk",
			arp: { on: true, rate: "16", gate: 0.6, swing: 0.25 },
			octave: 3,
			sustain: true,
			effects: { reverb: 0.4, chorusMix: 0.2 },
		});
		expect(parseTextToChordsReply(`{"chart":"| C |"}`).setup).toEqual({});
	});
	it("refuses what it cannot read, with a reason the model can act on", () => {
		expect(() => parseTextToChordsReply("no json here")).toThrow("no JSON object");
		expect(() => parseTextToChordsReply(`{"chart":" "}`)).toThrow();
		expect(() => parseTextToChordsReply(`{"chords":[{"degree":"I"}]}`)).toThrow("chart");
		expect(() => parseTextToChordsReply(`{"chart":"key: C\\n\\n| C | G |\\n| Q | F |"}`)).toThrow(
			"line 4: Q",
		);
		expect(() => parseTextToChordsReply(`{"chart":"key: C"}`)).toThrow("the chart has no bars");
	});
});
