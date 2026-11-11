import { describe, expect, it } from "vite-plus/test";
import * as v from "valibot";
import { MAX_ARRANGEMENTS } from "../constants/arrangements";
import {
	ArrangementCreateSchema,
	ArrangementOrderSchema,
	ArrangementUpdateSchema,
} from "./ArrangementSchema";
import { DefaultMixSchema } from "./SongSchema";
import { StemOrderSchema } from "./StemOrderSchema";

const id = "V1StGXR8_Z5jdHi6B-myT";
const other = "Uakgb_J5m9g-0JDMbcJqL";

describe("ArrangementCreateSchema", () => {
	it("trims the name and note, and starts from Main without a source", () => {
		expect(v.parse(ArrangementCreateSchema, { songId: id, name: " Acoustic " })).toEqual({
			songId: id,
			name: "Acoustic",
			note: "",
			from: "main",
		});
		expect(
			v.parse(ArrangementCreateSchema, { songId: id, name: "B", note: " capo 2 ", from: "empty" }),
		).toMatchObject({ note: "capo 2", from: "empty" });
		expect(v.parse(ArrangementCreateSchema, { songId: id, name: "B", from: other }).from).toBe(
			other,
		);
	});
	it("refuses a blank or long name, a long note and a source that is no id", () => {
		const fails = (patch: object) =>
			expect(
				v.safeParse(ArrangementCreateSchema, { songId: id, name: "B", ...patch }).success,
			).toBe(false);
		fails({ name: "   " });
		fails({ name: "x".repeat(41) });
		fails({ note: "x".repeat(201) });
		fails({ from: "not an id!" });
		fails({ songId: "nope!" });
	});
});

describe("ArrangementUpdateSchema", () => {
	it("takes a name, a note or both; one left out stays absent", () => {
		expect(v.parse(ArrangementUpdateSchema, { id, name: " Live " })).toEqual({ id, name: "Live" });
		expect(v.parse(ArrangementUpdateSchema, { id, note: "" })).toEqual({ id, note: "" });
		expect(v.safeParse(ArrangementUpdateSchema, { id, name: "" }).success).toBe(false);
	});
});

describe("ArrangementOrderSchema", () => {
	it(`takes one to ${MAX_ARRANGEMENTS} ids`, () => {
		expect(v.safeParse(ArrangementOrderSchema, { songId: id, ids: [other] }).success).toBe(true);
		expect(v.safeParse(ArrangementOrderSchema, { songId: id, ids: [] }).success).toBe(false);
		expect(
			v.safeParse(ArrangementOrderSchema, {
				songId: id,
				ids: Array.from({ length: MAX_ARRANGEMENTS + 1 }, () => other),
			}).success,
		).toBe(false);
	});
});

describe("the stem commands name an arrangement", () => {
	it("a stem order and a default mix are Main's (null) unless they name one", () => {
		expect(v.parse(StemOrderSchema, { songId: id, ids: [other] }).arrangementId).toBeNull();
		expect(
			v.parse(StemOrderSchema, { songId: id, ids: [other], arrangementId: other }).arrangementId,
		).toBe(other);
		expect(
			v.safeParse(StemOrderSchema, { songId: id, ids: [other], arrangementId: 3 }).success,
		).toBe(false);
		const mix = v.parse(DefaultMixSchema, {
			id,
			gains: [
				{ id: other, gain: 1, muted: true },
				{ id, gain: 0.5 },
			],
			arrangementId: other,
		});
		expect(mix.arrangementId).toBe(other);
		expect(mix.gains[0].muted).toBe(true);
		expect(mix.gains[1]).toEqual({ id, gain: 0.5, pan: 0 });
		expect(v.parse(DefaultMixSchema, { id, gains: [{ id, gain: 1 }] }).arrangementId).toBeNull();
	});
});
