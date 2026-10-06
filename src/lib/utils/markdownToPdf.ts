import { marked, type Token, type Tokens } from "marked";

/**
 * Markdown into an open pdfkit document (src/lib/server/documentation.ts:
 * a song's lyrics, chart and notes as a PDF). Works from marked's lexer
 * tokens, the same parser the editor and the song page render with, and
 * draws with pdfkit's built-in fonts so nothing ships with the function:
 * Helvetica for prose (bold, italic and bold italic kept), Courier for
 * code blocks and `code` spans, so a chord grid typed over its lyric lines
 * stays lined up. Headings shrink by depth, lists get bullets or numbers
 * and nest by indentation, blockquotes indent, rules are drawn, line
 * breaks and the paragraph gaps are kept; links are their text, images
 * their alt text, raw HTML its text. pdfkit breaks pages on its own as the
 * text runs past the bottom margin. The caller owns the document: its
 * page size, margins and what comes before and after.
 */
export function markdownToPdfPages(doc: PDFKit.PDFDocument, markdown: string): void {
	renderBlocks(doc, marked.lexer(markdown), 0);
	doc.x = doc.page.margins.left;
}

const BODY_SIZE = 11;
const CODE_SIZE = 9.5;
/** Heading sizes by depth, h1 first. */
const HEADING_SIZES = [20, 16, 14, 12.5, 11.5, 11];
/** How far a list's content sits from its marker, and a blockquote from the text around it. */
const LIST_INDENT = 18;
const QUOTE_INDENT = 16;

/** A piece of inline text with the face it takes. */
interface Run {
	text: string;
	bold: boolean;
	italic: boolean;
	code: boolean;
}

function fontOf(run: Run): string {
	if (run.code) return "Courier";
	if (run.bold && run.italic) return "Helvetica-BoldOblique";
	if (run.bold) return "Helvetica-Bold";
	if (run.italic) return "Helvetica-Oblique";
	return "Helvetica";
}

/** The inline tokens of a block flattened to runs, adjacent runs of one face merged. */
function runsOf(tokens: Token[] | undefined, style = { bold: false, italic: false }): Run[] {
	const out: Run[] = [];
	const push = (text: string, code = false) => {
		if (!text) return;
		const last = out.at(-1);
		if (last && last.code === code && last.bold === style.bold && last.italic === style.italic) {
			last.text += text;
		} else out.push({ text, code, ...style });
	};
	for (const t of tokens ?? []) {
		switch (t.type) {
			case "text": {
				const text = t as Tokens.Text;
				if (text.tokens) out.push(...runsOf(text.tokens, style));
				else push(text.text);
				break;
			}
			case "escape":
				push((t as Tokens.Escape).text);
				break;
			case "strong":
				out.push(...runsOf((t as Tokens.Strong).tokens, { ...style, bold: true }));
				break;
			case "em":
				out.push(...runsOf((t as Tokens.Em).tokens, { ...style, italic: true }));
				break;
			case "del":
				out.push(...runsOf((t as Tokens.Del).tokens, style));
				break;
			case "link":
				out.push(...runsOf((t as Tokens.Link).tokens, style));
				break;
			case "codespan":
				push((t as Tokens.Codespan).text, true);
				break;
			case "br":
				push("\n");
				break;
			case "image":
				push((t as Tokens.Image).text);
				break;
			case "html":
				push(stripTags((t as Tokens.HTML).text));
				break;
			default:
				if ("tokens" in t && Array.isArray(t.tokens)) out.push(...runsOf(t.tokens, style));
				else if ("text" in t && typeof t.text === "string") push(t.text);
		}
	}
	// Merge again across the boundaries the recursion left.
	return out.reduce<Run[]>((acc, r) => {
		const last = acc.at(-1);
		if (last && last.code === r.code && last.bold === r.bold && last.italic === r.italic)
			last.text += r.text;
		else acc.push({ ...r });
		return acc;
	}, []);
}

const stripTags = (html: string) => html.replace(/<[^>]*>/g, "");

/** The width left for text at this indent. */
function widthAt(doc: PDFKit.PDFDocument, indent: number): number {
	return doc.page.width - doc.page.margins.left - doc.page.margins.right - indent;
}

/** A new page when the next line would not fit, so a list marker and its text land on the same page. */
function ensureLine(doc: PDFKit.PDFDocument): void {
	if (doc.y + doc.currentLineHeight(true) > doc.page.maxY()) doc.addPage();
}

/** Runs written as one wrapped paragraph from `x`, faces switching mid-line. */
function writeRuns(
	doc: PDFKit.PDFDocument,
	runs: Run[],
	x: number,
	width: number,
	size: number,
	face?: { bold?: boolean },
): void {
	doc.x = x;
	if (runs.length === 0) {
		doc.font("Helvetica").fontSize(size).text("", { width });
		return;
	}
	runs.forEach((run, i) => {
		const styled = face?.bold ? { ...run, bold: true } : run;
		doc.font(fontOf(styled)).fontSize(run.code ? size - 1 : size);
		doc.text(run.text, { width, continued: i < runs.length - 1 });
	});
}

function renderBlocks(doc: PDFKit.PDFDocument, tokens: Token[], indent: number): void {
	for (const token of tokens) renderBlock(doc, token, indent);
}

function renderBlock(doc: PDFKit.PDFDocument, token: Token, indent: number): void {
	const x = doc.page.margins.left + indent;
	const width = widthAt(doc, indent);
	switch (token.type) {
		case "space":
			return;
		case "heading": {
			const h = token as Tokens.Heading;
			const size = HEADING_SIZES[Math.min(h.depth, HEADING_SIZES.length) - 1] ?? BODY_SIZE;
			doc.moveDown(0.5);
			writeRuns(doc, runsOf(h.tokens), x, width, size, { bold: true });
			doc.moveDown(0.3);
			return;
		}
		case "paragraph":
			writeRuns(doc, runsOf((token as Tokens.Paragraph).tokens), x, width, BODY_SIZE);
			doc.moveDown(0.6);
			return;
		case "text": {
			// A tight list item's line: no paragraph gap after it.
			const t = token as Tokens.Text;
			writeRuns(doc, t.tokens ? runsOf(t.tokens) : runsOf([t]), x, width, BODY_SIZE);
			return;
		}
		case "list":
			renderList(doc, token as Tokens.List, indent);
			doc.moveDown(0.4);
			return;
		case "blockquote":
			renderBlocks(doc, (token as Tokens.Blockquote).tokens, indent + QUOTE_INDENT);
			return;
		case "code":
			doc.x = x;
			doc
				.font("Courier")
				.fontSize(CODE_SIZE)
				.text((token as Tokens.Code).text, { width, lineGap: 1 });
			doc.moveDown(0.8);
			return;
		case "hr": {
			doc.moveDown(0.3);
			const y = doc.y;
			doc
				.save()
				.moveTo(x, y)
				.lineTo(x + width, y)
				.lineWidth(0.5)
				.strokeColor("#999999")
				.stroke()
				.restore();
			doc.moveDown(0.7);
			return;
		}
		case "table": {
			// Rows as lines of Courier, cells divided by bars, so the columns keep some shape.
			const table = token as Tokens.Table;
			const line = (cells: Tokens.TableCell[]) =>
				cells
					.map((c) =>
						runsOf(c.tokens)
							.map((r) => r.text)
							.join(""),
					)
					.join(" | ");
			const lines = [line(table.header), ...table.rows.map(line)];
			doc.x = x;
			doc.font("Courier").fontSize(CODE_SIZE).text(lines.join("\n"), { width, lineGap: 1 });
			doc.moveDown(0.8);
			return;
		}
		case "html":
			writeRuns(
				doc,
				[
					{
						text: stripTags((token as Tokens.HTML).text).trim(),
						bold: false,
						italic: false,
						code: false,
					},
				],
				x,
				width,
				BODY_SIZE,
			);
			doc.moveDown(0.6);
			return;
		default:
			if ("tokens" in token && Array.isArray(token.tokens)) {
				writeRuns(doc, runsOf(token.tokens), x, width, BODY_SIZE);
				doc.moveDown(0.6);
			}
	}
}

function renderList(doc: PDFKit.PDFDocument, list: Tokens.List, indent: number): void {
	const start = typeof list.start === "number" ? list.start : 1;
	const x = doc.page.margins.left + indent;
	list.items.forEach((item, i) => {
		const marker = item.task
			? item.checked
				? "[x]"
				: "[ ]"
			: list.ordered
				? `${start + i}.`
				: "•";
		ensureLine(doc);
		const y = doc.y;
		doc.font("Helvetica").fontSize(BODY_SIZE);
		doc.text(marker, x, y, { width: LIST_INDENT, lineBreak: false });
		// Back up to the marker's line: the item's text starts beside it.
		doc.y = y;
		renderBlocks(doc, item.tokens, indent + LIST_INDENT);
		if (item.loose) doc.moveDown(0.3);
	});
}
