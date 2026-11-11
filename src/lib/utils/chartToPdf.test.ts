import { readFileSync } from "node:fs";
import PDFDocument from "pdfkit";
import { describe, expect, test } from "vite-plus/test";
import edwinDataUrl from "../../../static/fonts/barmark/Edwin-Roman.otf?inline";
import { chartToPdfPages } from "./chartToPdf";

const FONTS = {
	chord: "Edwin",
	text: "Helvetica",
	textBold: "Helvetica-Bold",
	textItalic: "Helvetica-Oblique",
};

interface Drawn {
	str: string;
	font: string;
	size: number;
	color: string;
	x: number;
	y: number;
	page: number;
}

/** A pdfkit document that records what is drawn: every string with its face and place, page breaks, dots. */
function recorder() {
	const state = { font: "", size: 12, color: "#000000", page: 1 };
	const texts: Drawn[] = [];
	const events: Array<{ kind: "text"; drawn: Drawn } | { kind: "page" }> = [];
	const circles: Array<{ x: number; y: number; r: number }> = [];
	const paths: string[] = [];
	const doc = {
		page: {
			width: 612,
			height: 792,
			margins: { top: 72, bottom: 72, left: 72, right: 72 },
		},
		x: 72,
		y: 72,
		font(name: string) {
			state.font = name;
			return doc;
		},
		fontSize(size: number) {
			state.size = size;
			return doc;
		},
		fillColor(color: string) {
			state.color = color;
			return doc;
		},
		strokeColor: () => doc,
		lineWidth: () => doc,
		moveTo: () => doc,
		lineTo: () => doc,
		stroke: () => doc,
		rect: () => doc,
		fill: () => doc,
		path: () => doc,
		bezierCurveTo() {
			paths.push("bezier");
			return doc;
		},
		circle(x: number, y: number, r: number) {
			circles.push({ x, y, r });
			return doc;
		},
		text(str: string, x?: number, y?: number) {
			const drawn = {
				str,
				font: state.font,
				size: state.size,
				color: state.color,
				x: x ?? doc.x,
				y: y ?? doc.y,
				page: state.page,
			};
			texts.push(drawn);
			events.push({ kind: "text", drawn });
			doc.x = drawn.x;
			doc.y = drawn.y + state.size * 1.2;
			return doc;
		},
		widthOfString: (str: string) => str.length * 5,
		heightOfString: (str: string, opts?: { width?: number }) =>
			Math.ceil((str.length * 5) / (opts?.width ?? 468)) * state.size * 1.2,
		addPage() {
			state.page++;
			events.push({ kind: "page" });
			doc.y = doc.page.margins.top;
			return doc;
		},
	};
	return { doc: doc as unknown as PDFKit.PDFDocument, texts, events, circles, paths, state };
}

const draw = (chart: string) => {
	const r = recorder();
	chartToPdfPages(r.doc, chart, FONTS);
	return r;
};
const strings = (texts: Drawn[]) => texts.map((t) => t.str);

const SONG = [
	"# Song",
	"key: F major",
	"time: 4/4",
	"tempo: 100",
	"",
	"## Verse",
	"| F | Bb | C7 | F |",
	"| / | / |",
	"",
	"## Chorus x2",
	"|: Dm7 | Gm7 |",
	"|1 C7 :|",
	"|2 F |",
].join("\n");

describe("chartToPdfPages", () => {
	test("the header, the headings, bar numbers, chords, holds, endings and repeat dots", () => {
		const { texts, circles, doc } = draw(SONG);
		const all = strings(texts);
		expect(texts[0]).toMatchObject({ str: "Song", font: "Helvetica-Bold", size: 14 });
		const meta = texts[1]!;
		expect(meta.str).toBe("F major · 4/4 · 100 bpm");
		expect(meta).toMatchObject({ font: "Edwin", color: "#555555" });
		// The rehearsal letters boxed, the headings, the block's ×2.
		expect(all).toContain("A");
		expect(all).toContain("B");
		expect(all).toContain("Verse");
		expect(all).toContain("Chorus ×2");
		// Bar numbers: 1 and 5 in the verse, 7, 9 and 10 in the chorus.
		const numbers = texts.filter((t) => t.size === 7.5).map((t) => t.str);
		expect(numbers).toEqual(["1", "5", "7", "9", "10"]);
		// Chords in the chord font, B♭ through the glyphs, the 7 raised and smaller.
		const chords = texts.filter((t) => t.font === "Edwin" && t.size === 11).map((t) => t.str);
		expect(chords).toEqual(expect.arrayContaining(["F", "B♭", "C", "Dm", "Gm"]));
		// C7 twice, Dm7, Gm7.
		const sevens = texts.filter((t) => t.str === "7" && t.font === "Edwin");
		expect(sevens.length).toBe(4);
		for (const s of sevens) expect(s).toMatchObject({ font: "Edwin", size: 7 });
		const c7 = texts.find((t) => t.str === "C" && t.size === 11)!;
		expect(sevens[0]!.y).toBeLessThan(c7.y);
		// Two holds, gray.
		const holds = texts.filter((t) => t.str === "/");
		expect(holds).toHaveLength(2);
		for (const h of holds) expect(h).toMatchObject({ font: "Edwin", color: "#777777" });
		// The endings.
		expect(all).toContain("1.");
		expect(all).toContain("2.");
		// ‖: on the chorus's first row and :‖ on its first ending: two dots each.
		expect(circles.filter((c) => c.r < 2)).toHaveLength(4);
		expect(doc.x).toBe(72);
		expect(doc.y).toBeGreaterThan(c7.y);
	});

	test("a long chart breaks pages between rows, and a heading keeps its first row", () => {
		const sections = Array.from(
			{ length: 20 },
			(_, i) => `## Part ${i + 1}\n| C | G | Am | F |\n| C | G | F | C |\n| Dm | G | C | C |`,
		);
		const { events, state } = draw(sections.join("\n\n"));
		expect(state.page).toBeGreaterThan(1);
		events.forEach((e, i) => {
			if (e.kind !== "page") return;
			const before = events
				.slice(0, i)
				.reverse()
				.find((x) => x.kind === "text");
			expect(before?.kind === "text" && before.drawn.str.startsWith("Part ")).toBe(false);
		});
		// Every text lies inside the page.
		for (const e of events) if (e.kind === "text") expect(e.drawn.y).toBeLessThanOrEqual(792 - 72);
	});

	test("an error line draws its source in Courier and its message under it", () => {
		// A structural error (a :| with no |:) is still an error line; an unreadable chord keeps its bar since barmark 0.23.
		const { texts } = draw("## A\n| C | F |\n| G | A :|");
		const source = texts.find((t) => t.font === "Courier");
		expect(source).toMatchObject({ str: "| G | A :|", color: "#b00020" });
		const message = texts.find((t) => t.font === "Helvetica" && t.color === "#b00020");
		expect(message?.y).toBeGreaterThan(source!.y);
	});

	test("a fermata and a Segno are narrow cells between the bars", () => {
		const { texts, paths } = draw("## A\n| Segno | C | ... | G |\n| F | D.S. |");
		expect(paths).toContain("bezier");
		const segno = texts.find((t) => t.str === "Segno")!;
		expect(segno.font).toBe("Helvetica-Oblique");
		expect(texts.find((t) => t.str === "D.S.")?.font).toBe("Helvetica-Oblique");
		// The bars share what the narrow cells leave: C sits well left of the middle of a four-bar row.
		const c = texts.find((t) => t.str === "C")!;
		const g = texts.find((t) => t.str === "G")!;
		const x0 = 72 + 26;
		const right = 612 - 72 - 18;
		// Two bars of (right - x0 - 12 - (5*5+8)) / 2 each, after the Segno cell.
		const bar = (right - x0 - 12 - 33) / 2;
		expect(c.x + 2.5).toBeCloseTo(x0 + 33 + bar / 2, 5);
		expect(g.x + 2.5).toBeCloseTo(x0 + 33 + bar + 12 + bar / 2, 5);
	});

	test("words go above the chords in the italic face", () => {
		const { texts } = draw('## A\n| "Oh" C "yeah" G | F |');
		const oh = texts.find((t) => t.str === "Oh")!;
		const c = texts.find((t) => t.str === "C")!;
		expect(oh.font).toBe("Helvetica-Oblique");
		expect(oh.size).toBe(8);
		expect(oh.y).toBeLessThan(c.y);
		expect(texts.find((t) => t.str === "yeah")?.font).toBe("Helvetica-Oblique");
	});

	test("draws N.C., rests, groups, pushes, accents, % and a system's labels", () => {
		const { texts } = draw(
			"part: Gtr = Guitar\npart: Bs = Bass\n## A\nGtr | N.C. | -- | C_D | <F |\nBs | >C | C | C | C |\n| % | % | % | % |",
		);
		const all = strings(texts);
		expect(all).toEqual(expect.arrayContaining(["N.C.", "–", "‹", ">", "Gtr", "Bs"]));
		// A tutti % whose parts copy different bars is drawn as %.
		expect(texts.filter((t) => t.str === "%" && t.size === 12)).toHaveLength(4);
		expect(texts.filter((t) => t.size === 8.5).map((t) => t.str)).toEqual(["C", "D"]);
		// The header names the parts.
		expect(all).toContain("Guitar, Bass");
		// One bar number for the system, then the tutti row's.
		expect(texts.filter((t) => t.size === 7.5).map((t) => t.str)).toEqual(["1", "5"]);
	});
});

describe("chartToPdfPages in a real document", () => {
	test("embeds Edwin and writes a PDF", async () => {
		const doc = new PDFDocument({ size: "A4", margin: 56 });
		const chunks: Buffer[] = [];
		doc.on("data", (c: Buffer) => chunks.push(c));
		const done = new Promise<void>((resolve) => doc.on("end", resolve));
		const font = Buffer.from(edwinDataUrl.split(",")[1]!, "base64");
		// The inline import carries the same bytes as the file.
		expect(font.equals(readFileSync("static/fonts/barmark/Edwin-Roman.otf"))).toBe(true);
		doc.registerFont("Edwin", font);
		chartToPdfPages(doc, `${SONG}\n\n## Bridge\n| Bbm7b5 | F#dim7 | ... | C/E |`, FONTS);
		doc.end();
		await done;
		const pdf = Buffer.concat(chunks).toString("latin1");
		expect(pdf.startsWith("%PDF-")).toBe(true);
		expect(pdf).toContain("Edwin");
	});
});
