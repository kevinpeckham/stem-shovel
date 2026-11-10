import {
	creditsText,
	glyphs,
	layoutChart,
	typesetChord,
	type BlockItem,
	type CellModel,
	type ChartModel,
	type ErrorItem,
	type RowItem,
	type SectionBlock,
} from "@barmark/render";
import { chartRehearsalLetters } from "./chartRehearsalLetters.js";
import {
	printDirection,
	printPasses,
	type Directives,
	type SimpleSlot,
	type Slot,
	type Words,
} from "barmark";

/** The faces the chart draws with: `chord` must hold ♯ ♭ ° ø (Edwin); the text faces may be pdfkit's built-ins. */
type Fonts = { chord: string; text: string; textBold: string; textItalic: string };

/**
 * A barmark chord chart drawn into an open pdfkit document as the engraved
 * chart on the song page draws it (src/lib/server/documentation.ts: the
 * chart section of a song's PDF). Works from @barmark/render's
 * `layoutChart` model, where every musical decision is made already, so
 * the PDF and the page agree on bar numbers, rehearsal letters, repeats,
 * endings and holds. From the current `doc.y` down, in points:
 *
 * - the header: the title (bold 14), a gray line of the parts, key, time,
 *   tempo and feel in the chord font (its ♭ and ♯), the credits under it;
 * - each section: a heading row (the rehearsal letter boxed, the heading,
 *   ×N), then its rows; a row is a 26 pt bar-number gutter and bars that
 *   share the width by the section's widest row of bars, 30 pt tall (40
 *   with words above the chords), with bar lines, repeat bar lines and
 *   dots, ×N after the row and an ending's bracket over it; a fermata, a
 *   direction and a rehearsal mark are narrow cells between bars;
 * - a system stacks its parts' rows with their labels in a column left of
 *   the gutter; text lines wrap, directives and errors are small lines.
 *
 * Chords are set in `fonts.chord` (root and quality at 11, the extension
 * raised at 7, the bass after a slash), holds as gray slashes, N.C., rests,
 * groups under a bracket, % for a simile bar, with accents, hits and pushes
 * marked. Pages break between rows (never inside one) and a heading keeps
 * its first row. The model's diagnostics are not drawn. Leaves `doc.x` at
 * the left margin and `doc.y` below the chart.
 */
export function chartToPdfPages(doc: PDFKit.PDFDocument, text: string, fonts: Fonts): void {
	const model = layoutChart(text, { rehearsalLetters: chartRehearsalLetters(text) });
	const { margins, width } = doc.page;
	const ctx: Ctx = {
		doc,
		fonts,
		left: margins.left,
		textRight: width - margins.right,
		right: width - margins.right - REPEAT_ROOM,
		labels: hasSystems(model) ? LABEL_COLUMN : 0,
		y: doc.y,
	};
	drawHeader(ctx, model);
	for (const block of model.blocks) drawBlock(ctx, block);
	drawCopyright(ctx, model);
	doc.fillColor(BLACK);
	doc.x = margins.left;
	doc.y = ctx.y;
}

interface Ctx {
	doc: PDFKit.PDFDocument;
	fonts: Fonts;
	left: number;
	/** Where text may run to: the right margin. */
	textRight: number;
	/** Where rows end: the right margin less the room for ×N. */
	right: number;
	/** The part-label column's width: 0 unless the chart has systems. */
	labels: number;
	y: number;
}

/** Where a row draws: its top and bottom, and the chords' baseline. */
interface Area {
	top: number;
	bottom: number;
	baseline: number;
}

/** One stretch of a slot's text in one face. */
interface Run {
	text: string;
	font: string;
	size: number;
	rise: number;
	color: string;
}

const GUTTER = 26;
const LABEL_COLUMN = 30;
const REPEAT_ROOM = 18;
const CELL_HEIGHT = 30;
const WORDS_ROOM = 10;
const SLOT_BASELINE = 19;
const ROW_GAP = 6;
const BLOCK_GAP = 10;
const HEADING_HEIGHT = 22;
const BOX = 13;
const FERMATA_WIDTH = 12;
const REHEARSAL_WIDTH = 16;
const CHORD_SIZE = 11;
const GROUP_SIZE = 8.5;
const THIN = 0.75;
const THICK = 1.75;
const BLACK = "#000000";
const GRAY = "#555555";
const HOLD_GRAY = "#777777";
const CUT_FILL = "#eeeeee";
const ERROR_RED = "#b00020";
/** `‹` for an eighth push, `«` for a sixteenth, as the page marks them (Edwin has both). */
const PUSH_MARK = { eighth: "‹", sixteenth: "«" } as const;
const ARTICULATION_MARK = { accent: ">", hit: "^" } as const;

const hasSystems = (model: ChartModel) =>
	model.blocks.some((b) => b.items.some((i) => i.kind === "system"));

/** A page break when `height` would run past the bottom margin. */
function room(ctx: Ctx, height: number): void {
	const { page } = ctx.doc;
	if (ctx.y + height <= page.height - page.margins.bottom) return;
	ctx.doc.addPage();
	ctx.y = ctx.doc.page.margins.top;
}

function widthOf(ctx: Ctx, text: string, font: string, size: number): number {
	return ctx.doc.font(font).fontSize(size).widthOfString(text);
}

/** One line of text with its baseline at `baseline`, never wrapped and never breaking the page. */
function put(
	ctx: Ctx,
	text: string,
	x: number,
	baseline: number,
	font: string,
	size: number,
	color = BLACK,
): void {
	ctx.doc
		.font(font)
		.fontSize(size)
		.fillColor(color)
		.text(text, x, baseline, { lineBreak: false, baseline: "alphabetic" });
}

function putCentered(
	ctx: Ctx,
	text: string,
	cx: number,
	baseline: number,
	font: string,
	size: number,
	color = BLACK,
): void {
	put(ctx, text, cx - widthOf(ctx, text, font, size) / 2, baseline, font, size, color);
}

function rule(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, width = THIN): void {
	ctx.doc.lineWidth(width).strokeColor(BLACK).moveTo(x1, y1).lineTo(x2, y2).stroke();
}

/** A line of the header or the foot, advancing the cursor. */
function textLine(ctx: Ctx, text: string, font: string, size: number, color = BLACK): void {
	room(ctx, size * 1.4);
	put(ctx, text, ctx.left, ctx.y + size, font, size, color);
	ctx.y += size * 1.4;
}

/** A directive's settings as [name, value], in the page's order: key, time, tempo, feel. */
function directiveParts(d: Directives): [string, string][] {
	const parts: [string, string][] = [];
	if (d.key) parts.push(["key", `${glyphs(d.key.tonic)} ${d.key.mode}`]);
	if (d.time) parts.push(["time", `${d.time.n}/${d.time.d}`]);
	// Edwin has no ♩, so a tempo reads in bpm.
	if (d.tempo) parts.push(["tempo", `${d.tempo} bpm`]);
	if (d.tempoChange) parts.push(["tempo", tempoChangeText(d.tempoChange)]);
	if (d.feel)
		parts.push(["feel", `${d.feel}${d.swingPercent === undefined ? "" : ` ${d.swingPercent}%`}`]);
	return parts;
}

function tempoChangeText(c: NonNullable<Directives["tempoChange"]>): string {
	if (c.kind === "a tempo") return c.kind;
	return `${c.kind}.${c.to === null ? "" : ` to ${c.to} bpm`}`;
}

/** The header's gray line: the parts, then the key, time, tempo and feel. */
function headerMeta(model: ChartModel): string {
	const names =
		model.parts.length > 1 ? model.parts.map((p) => p.name).join(", ") : model.part?.name;
	return [names ?? "", ...directiveParts(model.header).map(([, v]) => v)]
		.filter(Boolean)
		.join(" · ");
}

function drawHeader(ctx: Ctx, model: ChartModel): void {
	const meta = headerMeta(model);
	const credits = creditsText(model.credits);
	if (!model.title && !meta && credits.length === 0) return;
	if (model.title) textLine(ctx, model.title, ctx.fonts.textBold, 14);
	if (meta) textLine(ctx, meta, ctx.fonts.chord, 10, GRAY);
	for (const line of credits) textLine(ctx, line, ctx.fonts.text, 9, GRAY);
	ctx.y += BLOCK_GAP;
}

function drawCopyright(ctx: Ctx, model: ChartModel): void {
	for (const line of model.credits.copyright) textLine(ctx, line, ctx.fonts.text, 7, GRAY);
}

/** The section's widest row in bars: narrow cells are not columns. */
function barColumns(block: SectionBlock): number {
	const rows = block.items.flatMap((i) =>
		i.kind === "row" ? [i] : i.kind === "system" ? i.rows.map((p) => p.row) : [],
	);
	const counts = rows.map((r) =>
		r.kind === "row" ? r.cells.filter((c) => c.kind === "slots").length : 0,
	);
	return Math.max(1, ...counts);
}

function drawBlock(ctx: Ctx, block: SectionBlock): void {
	const first = block.items[0];
	const heading = block.heading === null ? 0 : HEADING_HEIGHT;
	room(ctx, heading + (first ? itemHeight(ctx, first) : 0));
	drawHeading(ctx, block);
	const columns = barColumns(block);
	for (const item of block.items) drawItem(ctx, item, columns);
	ctx.y += BLOCK_GAP;
}

/** A letter in a small square box, its left at `x` and its top at `top`; returns the box's width. */
function drawBox(ctx: Ctx, label: string, x: number, top: number): number {
	const w = Math.max(BOX, widthOf(ctx, label, ctx.fonts.textBold, 9) + 6);
	ctx.doc.lineWidth(THIN).strokeColor(BLACK).rect(x, top, w, BOX).stroke();
	putCentered(ctx, label, x + w / 2, top + BOX - 3.5, ctx.fonts.textBold, 9);
	return w;
}

function drawHeading(ctx: Ctx, block: SectionBlock): void {
	if (block.heading === null) return;
	const top = ctx.y + 2;
	const box = block.rehearsal ? drawBox(ctx, block.rehearsal, ctx.left, top) + 6 : 0;
	const times = typeof block.repeat === "number" ? ` ×${block.repeat}` : "";
	put(ctx, `${block.heading}${times}`, ctx.left + box, top + 10.5, ctx.fonts.textBold, 11);
	ctx.y += HEADING_HEIGHT;
}

const rowHeight = (row: RowItem) =>
	CELL_HEIGHT + (row.cells.some((c) => c.kind === "slots" && c.words?.length) ? WORDS_ROOM : 0);

const errorHeight = (item: ErrorItem) => 12 + 10 * item.messages.length + 4;

function textHeight(ctx: Ctx, item: Extract<BlockItem, { kind: "text" }>): number {
	const [font, size] = textFace(ctx, item.note);
	return (
		ctx.doc
			.font(font)
			.fontSize(size)
			.heightOfString(item.text, { width: ctx.textRight - ctx.left }) + 4
	);
}

const textFace = (ctx: Ctx, note: boolean): [string, number, string] =>
	note ? [ctx.fonts.text, 9, GRAY] : [ctx.fonts.textItalic, 10, BLACK];

function itemHeight(ctx: Ctx, item: BlockItem): number {
	switch (item.kind) {
		case "row":
			return rowHeight(item) + ROW_GAP;
		case "system":
			return (
				item.rows.reduce(
					(h, p) => h + (p.row.kind === "row" ? rowHeight(p.row) : errorHeight(p.row)),
					0,
				) + ROW_GAP
			);
		case "text":
			return textHeight(ctx, item);
		case "directive":
			return 13;
		case "error":
			return errorHeight(item);
	}
}

function drawItem(ctx: Ctx, item: BlockItem, columns: number): void {
	room(ctx, itemHeight(ctx, item));
	switch (item.kind) {
		case "row":
			drawRow(ctx, item, columns, null);
			ctx.y += ROW_GAP;
			return;
		case "system":
			return drawSystem(ctx, item, columns);
		case "text":
			return drawText(ctx, item);
		case "directive":
			return drawDirective(ctx, item.set);
		case "error":
			return drawError(ctx, item);
	}
}

function drawText(ctx: Ctx, item: Extract<BlockItem, { kind: "text" }>): void {
	const [font, size, color] = textFace(ctx, item.note);
	const height = textHeight(ctx, item);
	ctx.doc
		.font(font)
		.fontSize(size)
		.fillColor(color)
		.text(item.text, ctx.left, ctx.y, { width: ctx.textRight - ctx.left });
	ctx.y += height;
}

/** A change mid-chart, named: "key: A♭ major · tempo: 96 bpm", in the chord font for its accidentals. */
function drawDirective(ctx: Ctx, set: Directives): void {
	const line = directiveParts(set)
		.map(([k, v]) => `${k}: ${v}`)
		.join(" · ");
	put(ctx, line, ctx.left + ctx.labels + GUTTER, ctx.y + 9, ctx.fonts.chord, 8, GRAY);
	ctx.y += 13;
}

/** A line barmark could not read: the source in Courier, each message under it. */
function drawError(ctx: Ctx, item: ErrorItem): void {
	const x = ctx.left + ctx.labels + GUTTER;
	put(ctx, item.source, x, ctx.y + 9, "Courier", 9, ERROR_RED);
	ctx.y += 12;
	for (const message of item.messages) {
		put(ctx, message, x, ctx.y + 8, ctx.fonts.text, 8, ERROR_RED);
		ctx.y += 10;
	}
	ctx.y += 4;
}

function drawSystem(ctx: Ctx, item: Extract<BlockItem, { kind: "system" }>, columns: number): void {
	// The first drawn row carries what the system shares: its number, ×N, the ending.
	const lead = item.rows.findIndex((p) => p.row.kind === "row");
	item.rows.forEach((p, i) => {
		if (p.row.kind === "error") drawError(ctx, p.row);
		else drawRow(ctx, p.row, columns, { label: p.label, first: i === lead });
	});
	ctx.y += ROW_GAP;
}

/** A narrow cell's width, or the bar width for a bar. */
function cellWidth(ctx: Ctx, cell: CellModel, bar: number): number {
	switch (cell.kind) {
		case "slots":
			return bar;
		case "fermata":
			return FERMATA_WIDTH;
		case "rehearsal":
			return REHEARSAL_WIDTH;
		case "direction":
			return widthOf(ctx, printDirection(cell.direction), ctx.fonts.textItalic, 9) + 8;
	}
}

/** Bars share what the narrow cells leave of the row, by the section's columns. */
function barWidth(ctx: Ctx, row: RowItem, columns: number, x0: number): number {
	const narrow = row.cells.reduce((w, c) => w + (c.kind === "slots" ? 0 : cellWidth(ctx, c, 0)), 0);
	return Math.max(0, ctx.right - x0 - narrow) / columns;
}

/** Whether the row starts or ends a repeat: ‖: on its first bar, :‖ after its last. */
const repeatStart = (row: RowItem) => row.opens || (row.repeat !== null && !row.closes);
const repeatEnd = (row: RowItem) => row.closes || row.repeat !== null;

function drawRow(
	ctx: Ctx,
	row: RowItem,
	columns: number,
	part: { label: string; first: boolean } | null,
): void {
	const top = ctx.y;
	const height = rowHeight(row);
	const worded = height > CELL_HEIGHT;
	const area: Area = {
		top,
		bottom: top + height,
		baseline: top + (worded ? WORDS_ROOM : 0) + SLOT_BASELINE,
	};
	const x0 = ctx.left + ctx.labels + GUTTER;
	const leads = !part || part.first;
	drawGutter(ctx, row, area, part, leads);
	const end = drawCells(ctx, row, x0, barWidth(ctx, row, columns, x0), area);
	if (repeatStart(row)) drawRepeatStart(ctx, x0, area);
	if (repeatEnd(row)) drawRepeatEnd(ctx, end, area);
	if (leads && typeof row.repeat === "number")
		put(ctx, `×${row.repeat}`, end + 4, area.baseline, ctx.fonts.textBold, 9);
	if (leads && row.ending) drawEnding(ctx, row.ending, x0, end, top);
	ctx.y = area.bottom;
}

/** The part's label and the bar number, right-aligned in the gutter. */
function drawGutter(
	ctx: Ctx,
	row: RowItem,
	area: Area,
	part: { label: string } | null,
	leads: boolean,
): void {
	if (part) put(ctx, part.label, ctx.left, area.baseline, ctx.fonts.text, 8);
	if (!leads || row.barNumber === null) return;
	const number = String(row.barNumber);
	const right = ctx.left + ctx.labels + GUTTER - 4;
	const x = right - widthOf(ctx, number, ctx.fonts.text, 7.5);
	put(ctx, number, x, area.baseline - 9, ctx.fonts.text, 7.5, GRAY);
}

/** The row's cells with a bar line before each and after the last; returns where the row ends. */
function drawCells(ctx: Ctx, row: RowItem, x0: number, bar: number, area: Area): number {
	const firstTacet = row.cells.findIndex((c) => c.kind === "slots" && c.tacet);
	let x = x0;
	row.cells.forEach((cell, i) => {
		const w = cellWidth(ctx, cell, bar);
		const before = row.cells.slice(0, i).findLast((c) => c.kind === "slots");
		const tempoMark =
			cell.kind === "slots" &&
			!!cell.tempoChange &&
			(before?.kind !== "slots" || before.tempoChange !== cell.tempoChange);
		drawCell(ctx, cell, { x, w, area, tacetLabel: i === firstTacet, tempoMark });
		rule(ctx, x, area.top, x, area.bottom);
		x += w;
	});
	rule(ctx, x, area.top, x, area.bottom);
	return x;
}

/** Where one cell draws, and what it says once per row. */
interface CellPlace {
	x: number;
	w: number;
	area: Area;
	tacetLabel: boolean;
	tempoMark: boolean;
}

function drawCell(ctx: Ctx, cell: CellModel, at: CellPlace): void {
	switch (cell.kind) {
		case "slots":
			return drawBar(ctx, cell, at);
		case "fermata":
			return drawFermata(ctx, at.x + at.w / 2, at.area.baseline - 3);
		case "rehearsal": {
			const w = Math.max(BOX, widthOf(ctx, cell.label, ctx.fonts.textBold, 9) + 6);
			drawBox(ctx, cell.label, at.x + (at.w - w) / 2, at.area.baseline - 10);
			return;
		}
		case "direction":
			put(ctx, printDirection(cell.direction), at.x + 4, at.area.baseline, ctx.fonts.textItalic, 9);
	}
}

/** A fermata: an arc over a dot, the dot at (`cx`, `y`). Edwin has no fermata glyph. */
function drawFermata(ctx: Ctx, cx: number, y: number): void {
	ctx.doc
		.lineWidth(0.9)
		.strokeColor(BLACK)
		.moveTo(cx - 4.5, y)
		.bezierCurveTo(cx - 4.5, y - 7, cx + 4.5, y - 7, cx + 4.5, y)
		.stroke();
	ctx.doc.circle(cx, y - 1, 1).fill(BLACK);
}

function drawBar(ctx: Ctx, cell: Extract<CellModel, { kind: "slots" }>, at: CellPlace): void {
	drawBarMarks(ctx, cell, at);
	const { x, w, area } = at;
	if (cell.tacet) {
		if (at.tacetLabel)
			putCentered(ctx, "tacet", x + w / 2, area.baseline, ctx.fonts.textItalic, 9, GRAY);
		return;
	}
	if (cell.words?.length) drawWords(ctx, cell.words, cell.slots.length, at);
	if (cell.simile) return putCentered(ctx, "%", x + w / 2, area.baseline, ctx.fonts.chord, 12);
	const share = w / Math.max(1, cell.slots.length);
	cell.slots.forEach((slot, i) => drawSlot(ctx, slot, x + (i + 0.5) * share, area.baseline, share));
}

/** What a bar carries besides its slots: the gray of a cut bar, rit. or accel. where it starts, a one-bar meter. */
function drawBarMarks(ctx: Ctx, cell: Extract<CellModel, { kind: "slots" }>, at: CellPlace): void {
	const { x, w, area } = at;
	if (cell.cut) ctx.doc.rect(x, area.top, w, area.bottom - area.top).fill(CUT_FILL);
	if (at.tempoMark && cell.tempoChange)
		put(ctx, `${cell.tempoChange}.`, x + 2, area.top + 8, ctx.fonts.textItalic, 8);
	if (cell.meter)
		put(ctx, `${cell.meter.n}/${cell.meter.d}`, x + 2, area.bottom - 3, ctx.fonts.textBold, 7);
}

/** Words over the slot they come before, or at the bar's end after the last slot. */
function drawWords(ctx: Ctx, words: Words[], slots: number, at: CellPlace): void {
	const baseline = at.area.top + 8;
	const share = at.w / Math.max(1, slots);
	for (const index of new Set(words.map((w) => w.at))) {
		const text = words
			.filter((w) => w.at === index)
			.map((w) => w.text)
			.join(" ");
		const width = widthOf(ctx, text, ctx.fonts.textItalic, 8);
		const x =
			index >= slots
				? at.x + at.w - width - 2
				: Math.max(at.x + 2, at.x + (index + 0.5) * share - width / 2);
		put(ctx, text, x, baseline, ctx.fonts.textItalic, 8);
	}
}

function drawSlot(ctx: Ctx, slot: Slot, cx: number, baseline: number, share: number): void {
	if (slot.kind !== "group")
		return drawMarked(ctx, slot, { cx, baseline, size: CHORD_SIZE, minX: cx - share / 2 + 3 });
	const left = cx - share / 2;
	const each = share / slot.members.length;
	slot.members.forEach((m, j) =>
		drawMarked(ctx, m, {
			cx: left + (j + 0.5) * each,
			baseline,
			size: GROUP_SIZE,
			minX: left + j * each + 2,
		}),
	);
	// The group's bracket, over its members.
	const y = baseline - GROUP_SIZE - 3;
	ctx.doc
		.lineWidth(0.5)
		.strokeColor(BLACK)
		.moveTo(left + 3, y + 2)
		.lineTo(left + 3, y)
		.lineTo(left + share - 3, y)
		.lineTo(left + share - 3, y + 2)
		.stroke();
}

/** Where a slot sits: centered on `cx`, but never left of `minX` (a long chord early in a bar keeps off its bar line). */
interface SlotPlace {
	cx: number;
	baseline: number;
	size: number;
	minX: number;
}

/** A slot with its push mark before it and its accent or hit above. */
function drawMarked(ctx: Ctx, slot: SimpleSlot, at: SlotPlace): void {
	const { baseline, size } = at;
	const runs = slotRuns(ctx, slot, size);
	const width = runs.reduce((w, r) => w + widthOf(ctx, r.text, r.font, r.size), 0);
	let x = Math.max(at.minX, at.cx - width / 2);
	if ("push" in slot && slot.push) {
		const mark = PUSH_MARK[slot.push];
		const markSize = size * 0.8;
		put(
			ctx,
			mark,
			x - widthOf(ctx, mark, ctx.fonts.chord, markSize) - 1,
			baseline,
			ctx.fonts.chord,
			markSize,
		);
	}
	if (slot.kind === "chord" && slot.articulation)
		putCentered(
			ctx,
			ARTICULATION_MARK[slot.articulation],
			x + width / 2,
			baseline - size - 1,
			ctx.fonts.text,
			8,
		);
	for (const r of runs) {
		put(ctx, r.text, x, baseline - r.rise, r.font, r.size, r.color);
		x += widthOf(ctx, r.text, r.font, r.size);
	}
}

/** What a slot says, as runs of text; a dotted group member ends in a dot. */
function slotRuns(ctx: Ctx, slot: SimpleSlot, size: number): Run[] {
	const run = (text: string, font = ctx.fonts.chord, at = size, color = BLACK, rise = 0): Run => ({
		text,
		font,
		size: at,
		rise,
		color,
	});
	const runs = unmarkedRuns(ctx, slot, size, run);
	return slot.dotted ? [...runs, run(".")] : runs;
}

function unmarkedRuns(
	ctx: Ctx,
	slot: SimpleSlot,
	size: number,
	run: (text: string, font?: string, at?: number, color?: string, rise?: number) => Run,
): Run[] {
	switch (slot.kind) {
		case "chord":
			return chordRuns(ctx, slot.chord, size, run);
		case "hold":
			return [run("/", ctx.fonts.chord, size, HOLD_GRAY)];
		case "nc":
			return [run("N.C.", ctx.fonts.text, (size * 9) / 11)];
		case "silence":
			return [run("–", ctx.fonts.text, size)];
		case "unknown":
			return [run("?", ctx.fonts.text, size)];
	}
}

/** Root and quality on the baseline, the superscript raised, the bass after a slash; a note set as written. */
function chordRuns(
	ctx: Ctx,
	chord: Extract<SimpleSlot, { kind: "chord" }>["chord"],
	size: number,
	run: (text: string, font?: string, at?: number, color?: string, rise?: number) => Run,
): Run[] {
	if (chord.kind === "notes" || !chord.parts) return [run(glyphs(chord.canonical))];
	const p = typesetChord(chord.parts);
	const runs = [run(`${p.root}${p.quality}`)];
	if (p.superscript)
		runs.push(run(p.superscript, ctx.fonts.chord, (size * 7) / 11, BLACK, (size * 4) / 11));
	if (p.bass) runs.push(run(`/${p.bass}`));
	return runs;
}

/** ‖: — a thick line, a thin one and two dots at the row's start. */
function drawRepeatStart(ctx: Ctx, x: number, area: Area): void {
	rule(ctx, x, area.top, x, area.bottom, THICK);
	rule(ctx, x + 3.5, area.top, x + 3.5, area.bottom);
	repeatDots(ctx, x + 7, area);
}

/** :‖ — two dots, a thin line and a thick one at the row's end. */
function drawRepeatEnd(ctx: Ctx, x: number, area: Area): void {
	rule(ctx, x, area.top, x, area.bottom, THICK);
	rule(ctx, x - 3.5, area.top, x - 3.5, area.bottom);
	repeatDots(ctx, x - 7, area);
}

function repeatDots(ctx: Ctx, x: number, area: Area): void {
	const mid = (area.top + area.bottom) / 2;
	ctx.doc.circle(x, mid - 4, 1.2).fill(BLACK);
	ctx.doc.circle(x, mid + 4, 1.2).fill(BLACK);
}

/** An ending's bracket over the row: "1.", "1-3.", "1., 3." at its left. */
function drawEnding(ctx: Ctx, passes: number[], x0: number, end: number, top: number): void {
	const label = printPasses(passes)
		.split(",")
		.map((part) => `${part}.`)
		.join(", ");
	ctx.doc
		.lineWidth(THIN)
		.strokeColor(BLACK)
		.moveTo(x0 + 1, top + 8)
		.lineTo(x0 + 1, top + 1)
		.lineTo(end - 1, top + 1)
		.stroke();
	put(ctx, label, x0 + 4, top + 9, ctx.fonts.text, 8);
}
