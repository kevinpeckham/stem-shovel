import { describe, expect, it } from "vite-plus/test";
import * as v from "valibot";
import { ChartDraftAnswerSchema, ChartDraftSchema, ChartSaveSchema } from "./ChartDraftSchema";

const id = "V1StGXR8_Z5jdHi6B-myT";
const ok = (schema: v.GenericSchema, input: unknown) => v.safeParse(schema, input).success;

describe("ChartDraftSchema", () => {
	const draft = {
		id,
		chords: [{ bar: 1, bars: 4, chord: " D5 " }],
		bars: [{ bar: 1, notes: "D3 x 2.0 @ 0.8" }],
	};
	const okWith = (patch: object) => ok(ChartDraftSchema, { ...draft, ...patch });
	it("trims a chord and needs at least one segment and one bar", () => {
		expect(v.parse(ChartDraftSchema, draft).chords[0].chord).toBe("D5");
		expect(okWith({ chords: [] })).toBe(false);
		expect(okWith({ bars: [] })).toBe(false);
	});
	it("bounds bars from 1 and the text per segment and per bar", () => {
		expect(okWith({ chords: [{ bar: 0, bars: 1, chord: "A" }] })).toBe(false);
		expect(okWith({ chords: [{ bar: 1, bars: 1.5, chord: "A" }] })).toBe(false);
		expect(okWith({ chords: [{ bar: 1, bars: 1, chord: "x".repeat(13) }] })).toBe(false);
		expect(okWith({ bars: [{ bar: 1, notes: "x".repeat(2001) }] })).toBe(false);
	});
});

describe("ChartSaveSchema", () => {
	it("defaults replace to false and caps the markdown", () => {
		expect(v.parse(ChartSaveSchema, { id, markdown: "# A" })).toEqual({
			id,
			markdown: "# A",
			replace: false,
		});
		expect(ok(ChartSaveSchema, { id, markdown: "x".repeat(200_001) })).toBe(false);
	});
});

describe("ChartDraftAnswerSchema", () => {
	const answer = {
		chords: " D5 D5 A5 % ",
		sections: [{ index: "A", name: " Verse ", bar: 1 }],
		progressions: [{ section: "Verse", chords: "D5 A5" }],
		chart: "| D5 | A5 |",
	};
	const okWith = (patch: object) => ok(ChartDraftAnswerSchema, { ...answer, ...patch });
	it("trims and gives the notes an empty default", () => {
		const parsed = v.parse(ChartDraftAnswerSchema, answer);
		expect(parsed.chords).toBe("D5 D5 A5 %");
		expect(parsed.sections[0].name).toBe("Verse");
		expect(parsed.notes).toBe("");
	});
	it("needs a section name, a bar from 1, and at most 64 sections", () => {
		expect(okWith({ sections: [{ index: "A", name: " ", bar: 1 }] })).toBe(false);
		expect(okWith({ sections: [{ index: "A", name: "Verse", bar: 0 }] })).toBe(false);
		const sections = Array.from({ length: 65 }, (_, i) => ({
			index: `${i}`,
			name: "S",
			bar: i + 1,
		}));
		expect(okWith({ sections })).toBe(false);
		expect(okWith({ sections: sections.slice(1) })).toBe(true);
		expect(okWith({ notes: "x".repeat(401) })).toBe(false);
	});
});
