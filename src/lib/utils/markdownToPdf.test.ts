import PDFDocument from "pdfkit";
import { describe, expect, it } from "vite-plus/test";
import { markdownToPdfPages } from "./markdownToPdf";

/** One A4 document rendered from markdown, as documentation.ts builds it. */
async function render(markdown: string): Promise<Uint8Array> {
	const doc = new PDFDocument({ size: "A4", margin: 56, compress: false });
	const chunks: Buffer[] = [];
	doc.on("data", (chunk: Buffer) => chunks.push(chunk));
	const done = new Promise<void>((resolve, reject) => {
		doc.on("end", resolve);
		doc.on("error", reject);
	});
	markdownToPdfPages(doc, markdown);
	doc.end();
	await done;
	return new Uint8Array(Buffer.concat(chunks));
}
const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1");
/** Page objects in the file (`/Type /Page`, not the `/Pages` tree). */
const pageObjects = (pdf: string) => pdf.match(/\/Type\s*\/Page\b/g)?.length ?? 0;

const SAMPLE = `# Blue in Green

Verse one, *softly*, with a **strong** word and a [link](https://example.com) and \`Cmaj7\` inline.

\`\`\`
Cmaj7   Dm7     G7      Cmaj7
Blue in green, the night is still
\`\`\`

> A quoted line
> over two lines

- first
- second with \`code\`
  - nested

1. one
2. two

---

| chord | beats |
| ----- | ----- |
| Am    | 4     |

Last line
with a break.
`;

describe("markdownToPdfPages", () => {
	it("writes a PDF with the prose in Helvetica and the code in Courier", async () => {
		const pdf = await render(SAMPLE);
		const text = latin1(pdf);
		expect(latin1(pdf.subarray(0, 5))).toBe("%PDF-");
		expect(pageObjects(text)).toBe(1);
		expect(text).toContain("/BaseFont /Helvetica-Bold");
		expect(text).toContain("/BaseFont /Helvetica-Oblique");
		expect(text).toContain("/BaseFont /Courier");
		// The words are there as glyph strings (pdfkit writes text hex-encoded): a page of them is more than an empty one.
		const empty = await render("");
		expect(pdf.length).toBeGreaterThan(empty.length + 1500);
	});
	it("breaks pages as a long document runs on", async () => {
		const long = Array.from(
			{ length: 80 },
			(_, i) =>
				`## Section ${i + 1}\n\nA paragraph of the kind a lyric sheet holds, line after line, for section ${i + 1}.\n\n- a point\n- another\n`,
		).join("\n");
		const pdf = await render(long);
		expect(latin1(pdf.subarray(0, 5))).toBe("%PDF-");
		expect(pageObjects(latin1(pdf))).toBeGreaterThan(1);
	});
	it("renders nothing for an empty document without failing", async () => {
		const pdf = await render("");
		expect(latin1(pdf.subarray(0, 5))).toBe("%PDF-");
		expect(pageObjects(latin1(pdf))).toBe(1);
	});
});
