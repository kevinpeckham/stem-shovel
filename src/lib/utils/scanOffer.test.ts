import { describe, expect, it } from "vite-plus/test";
import type { Detection } from "#lib/audio/analysis.js";
import type { SongChange } from "#lib/val/SongChangeSchema.js";
import { scanOffer } from "./scanOffer";

const detection = (
	bpm: number,
	meter: Detection["meter"]["value"] = "4/4",
	subdivision: 2 | 3 = 2,
): Pick<Detection, "tempo" | "meter"> => ({
	tempo: { bpm, confidence: 0.8, subdivision, alternates: [] },
	meter: { value: meter, confidence: 0.8 },
});
const tempo = (value: string): SongChange => ({ kind: "tempo", start: 0, value });
const meter = (value: string): SongChange => ({ kind: "meter", start: 0, value });
const key = (start: number, value: string): SongChange => ({ kind: "key", start, value });

describe("scanOffer", () => {
	it("offers every row when the song has no tempo", () => {
		const rows = [tempo("112"), key(0, "D major"), meter("4/4")];
		expect(scanOffer(detection(112), rows, [key(0, "C major")])).toEqual({
			values: rows,
			ladder: null,
			agrees: [],
		});
	});

	it("offers every row when the tempo is off the ladder", () => {
		const rows = [tempo("100"), key(0, "D major"), meter("4/4")];
		const offer = scanOffer(detection(100), rows, [tempo("120"), meter("4/4")]);
		expect(offer.ladder).toBeNull();
		expect(offer.values).toBe(rows);
	});

	it("agrees on a direct match and drops tempo, meter and same keys", () => {
		const rows = [tempo("120"), key(0, "C major"), meter("4/4")];
		const offer = scanOffer(detection(120.4), rows, [
			tempo("120"),
			key(0, "C major"),
			meter("4/4"),
		]);
		expect(offer).toEqual({
			values: [],
			ladder: { factor: 1, declared: 120 },
			agrees: ["tempo", "meter", "key"],
		});
	});

	it("matches a fast waltz counted in eighths and still offers a differing key", () => {
		const rows = [tempo("112"), key(0, "E minor"), meter("3/4")];
		const offer = scanOffer(detection(112), rows, [tempo("224"), key(0, "D major"), meter("3/4")]);
		expect(offer.ladder).toEqual({ factor: 2, declared: 224 });
		expect(offer.agrees).toEqual(["tempo", "meter"]);
		expect(offer.values).toEqual([key(0, "E minor")]);
	});

	it("keeps a differing meter in the offer", () => {
		const rows = [tempo("60"), meter("3/4")];
		const offer = scanOffer(detection(60, "3/4"), rows, [tempo("120"), meter("4/4")]);
		expect(offer.ladder?.factor).toBe(2);
		expect(offer.values).toEqual([meter("3/4")]);
	});

	it("compares keys in order of their start", () => {
		const rows = [tempo("120"), key(0, "C major"), key(60, "D major")];
		const own = [tempo("120"), key(60, "D major"), key(0, "C major")];
		expect(scanOffer(detection(120), rows, own).agrees).toContain("key");
		expect(scanOffer(detection(120), rows, [tempo("120"), key(0, "D major")]).agrees).not.toContain(
			"key",
		);
	});

	it("allows the 3:2 rungs only for a compound meter the song declares, never the detector's flag", () => {
		const rows = [tempo("97")];
		expect(scanOffer(detection(97), rows, [tempo("145")]).ladder).toBeNull();
		expect(scanOffer(detection(97, "4/4", 3), rows, [tempo("145")]).ladder).toBeNull();
		expect(scanOffer(detection(97, "6/8"), rows, [tempo("145")]).ladder).toBeNull();
		expect(scanOffer(detection(97), rows, [tempo("145"), meter("6/8")]).ladder?.factor).toBe(1.5);
	});

	it("keeps the warning when the detector's compound flag fires at a wrong pulse (Peaceful Dreams)", () => {
		const peaceful: Pick<Detection, "tempo" | "meter"> = {
			tempo: { bpm: 96.7, confidence: 0.5, subdivision: 3, alternates: [] },
			meter: { value: "6/8", confidence: 0.5 },
		};
		const rows = [tempo("97"), meter("6/8"), key(0, "G major")];
		const offer = scanOffer(peaceful, rows, [tempo("145"), meter("4/4")]);
		expect(offer).toEqual({ values: rows, ladder: null, agrees: [] });
	});

	it("matches a fast waltz whose bar the stems hear as the beat at ×3, meter and all (Mop Heart)", () => {
		const rows = [tempo("75"), meter("6/8"), key(0, "A minor")];
		const offer = scanOffer(detection(74.7, "6/8", 3), rows, [tempo("224"), meter("3/4")]);
		expect(offer.ladder).toEqual({ factor: 3, declared: 224 });
		expect(offer.agrees).toEqual(expect.arrayContaining(["tempo", "meter"]));
		expect(offer.values).toEqual([key(0, "A minor")]);
	});

	it("matches a 6/8 song read as straight quarters at 2/3, and its meter agrees", () => {
		const rows = [tempo("90"), meter("4/4")];
		const offer = scanOffer(detection(90, "4/4", 2), rows, [tempo("60"), meter("6/8")]);
		expect(offer.ladder?.factor).toBe(2 / 3);
		expect(offer.agrees).toEqual(["tempo", "meter"]);
		expect(offer.values).toEqual([]);
	});

	it("reads a declared tempo with decimals", () => {
		expect(scanOffer(detection(60), [tempo("60")], [tempo("120.5")]).ladder).toEqual({
			factor: 2,
			declared: 120.5,
		});
	});
});
