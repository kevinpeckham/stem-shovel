import { describe, expect, it } from "vite-plus/test";
import { zipSync } from "fflate";
import { musicXmlFromMxl } from "./musicXmlFromMxl";
import { keyName, musicXmlSummary } from "./musicXmlSummary";

const score = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>Exiles &amp; Endtimes</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
    <score-part id="P2"><part-name>Bass</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <key><fifths>0</fifths><mode>major</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <direction><direction-type><rehearsal>A</rehearsal></direction-type></direction>
      <direction><direction-type><words>Verse</words></direction-type><sound tempo="96"/></direction>
      <harmony><root><root-step>C</root-step></root><kind>major-seventh</kind></harmony>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note>
      <harmony><root><root-step>A</root-step></root><kind>minor-seventh</kind></harmony>
    </measure>
    <measure number="2">
      <harmony><root><root-step>F</root-step></root><kind text="maj9">major-ninth</kind></harmony>
      <barline location="right"><repeat direction="backward"/></barline>
    </measure>
    <measure number="3">
      <attributes><key><fifths>-4</fifths><mode>major</mode></key></attributes>
      <harmony><root><root-step>A</root-step><root-alter>-1</root-alter></root><kind>major</kind>
        <degree><degree-value>9</degree-value><degree-alter>0</degree-alter><degree-type>add</degree-type></degree>
        <bass><bass-step>C</bass-step></bass></harmony>
    </measure>
    <measure number="4"><note><rest/><duration>4</duration></note></measure>
    <measure number="5">
      <attributes><key><fifths>3</fifths><mode>minor</mode></key></attributes>
      <harmony><root><root-step>F</root-step><root-alter>1</root-alter></root><kind>minor</kind></harmony>
    </measure>
  </part>
  <part id="P2"><measure number="1"><note><pitch><step>C</step><octave>2</octave></pitch><duration>4</duration></note></measure></part>
</score-partwise>`;

describe("musicXmlSummary", () => {
	it("lists the keys, meter, marks and chords per measure of the part with harmony", () => {
		expect(musicXmlSummary(score)).toBe(
			[
				"Title: Exiles & Endtimes",
				"Part: Piano (2 parts)",
				'm1 key C major 4/4 tempo 96 [A] "Verse": Cmaj7 Am7',
				"m2 :|: Fmaj9",
				"m3 key A♭ major: A♭add9/C",
				"m5 key F♯ minor: F♯m",
			].join("\n"),
		);
	});
	it("names key signatures from their fifths", () => {
		expect(keyName(-3)).toBe("E♭ major");
		expect(keyName(2, "minor")).toBe("B minor");
		expect(keyName(0, "dorian")).toBe("C dorian");
	});
	it("cuts a long score and says so", () => {
		const text = musicXmlSummary(score, 60);
		expect(text.length).toBeLessThan(100);
		expect(text.endsWith("… (the score goes on)")).toBe(true);
	});
	it("is empty for XML without parts", () => {
		expect(musicXmlSummary("<score-partwise/>")).toBe("");
	});
});

describe("musicXmlFromMxl", () => {
	const bytes = (s: string) => new TextEncoder().encode(s);
	it("reads the rootfile the container names", () => {
		const zip = zipSync({
			"META-INF/container.xml": bytes(
				'<container><rootfiles><rootfile full-path="score.musicxml"/></rootfiles></container>',
			),
			"score.musicxml": bytes(score),
			"other.xml": bytes("<nope/>"),
		});
		expect(musicXmlFromMxl(zip)).toBe(score);
	});
	it("falls back to the first XML outside META-INF, and is null for a zip without one", () => {
		expect(musicXmlFromMxl(zipSync({ "a/score.xml": bytes("<x/>") }))).toBe("<x/>");
		expect(musicXmlFromMxl(zipSync({ "readme.txt": bytes("hi") }))).toBeNull();
		expect(musicXmlFromMxl(bytes("not a zip"))).toBeNull();
	});
});
