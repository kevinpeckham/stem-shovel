import { readBlob } from "#lib/server/blob.js";
import { projectForDocumentation } from "#lib/server/data.js";
import { markdownToPdfPages } from "#lib/utils/markdownToPdf.js";
import { chartToPdfPages } from "#lib/utils/chartToPdf.js";
import { layoutChart } from "@barmark/render";
import edwinDataUrl from "../../../static/fonts/barmark/Edwin-Roman.otf?inline";
import { safeFilename } from "#lib/utils/safeFilename.js";
import { chartMusicXml } from "#lib/utils/chartMusicXml.js";
import { printChart } from "barmark";
import { zipSync, type Zippable } from "fflate";
import { appendToPdf, type PdfAppendix } from "#lib/utils/appendToPdf.js";
import PDFDocument from "pdfkit";

/**
 * Documentation downloads (docs/uploads-and-blob.md, "Documentation
 * downloads"): a song's lyrics, chart and notes as one PDF, a project's
 * songs as a zip of those PDFs, and a project's charts as a zip of every
 * score (the rendered PDF and the MusicXML file), every file marked as
 * notation, and the chart text itself as markdown and as a PDF. Built on
 * demand inside the request that asks (`GET /api/songs/[id]/documentation.pdf`,
 * `GET /api/projects/[id]/documentation.zip`, `GET /api/projects/[id]/charts.zip`),
 * not in the jobs function: nothing is stored, and a project of forty songs
 * renders in a few seconds. pdfkit draws the lyrics and notes with its
 * built-in fonts (utils/markdownToPdf.ts) and a chart of bars from
 * barmark's renderer model in the chart's own font, Edwin
 * (utils/chartToPdf.ts: the built-ins are WinAnsi and have no ♯, ♭, ° or
 * ø), which ships inside the function as a `?inline` import (Vite's
 * base64 data URL) and is registered on every document; fflate zips (`zipSync`, stored for files that
 * are compressed already, deflated for text). Page code never imports this
 * module: pdfkit would sit in every page function's bundle.
 */

export type DocumentationSection = "lyrics" | "chart" | "notes";
const DOCUMENTATION_SECTIONS: readonly DocumentationSection[] = ["lyrics", "chart", "notes"];
const SECTION_TITLE: Record<DocumentationSection, string> = {
	lyrics: "Lyrics",
	chart: "Chart",
	notes: "Notes",
};

/** What a song's PDF is built from: its title line and its three documents; `sections` narrows which (all by default). */
export interface DocumentedSong {
	title: string;
	version?: string;
	projectName?: string;
	lyricsMarkdown: string;
	chartMarkdown: string;
	notesMarkdown: string;
	sections?: readonly DocumentationSection[];
}

const textOf = (song: DocumentedSong, section: DocumentationSection): string =>
	section === "lyrics"
		? song.lyricsMarkdown
		: section === "chart"
			? song.chartMarkdown
			: song.notesMarkdown;

/** The sections that have text, in order: what the PDF will hold. */
function documentedSections(song: DocumentedSong): DocumentationSection[] {
	return (song.sections ?? DOCUMENTATION_SECTIONS).filter((s) => textOf(song, s).trim() !== "");
}

/** Whether there is anything to put in the song's PDF: text, or notation to merge in. */
export const hasDocumentation = (song: DocumentedSong, notationCount = 0): boolean =>
	documentedSections(song).length > 0 || notationCount > 0;

/** A song's notation as it comes from the database, for the pages merged after its text (Kevin). */
export interface NotationSource {
	notation: { pdfUrl: string | null; pdfStatus: string | null }[];
	files: { url: string; kind?: string; filename: string }[];
}
/** The bytes of a song's scores (their rendered PDFs) and notation attachments (PDFs and images), in order, those that can be read. */
export async function notationPartsOf(song: NotationSource): Promise<PdfAppendix[]> {
	const parts: PdfAppendix[] = [];
	for (const score of song.notation) {
		if (score.pdfStatus !== "ready" || !score.pdfUrl) continue;
		const bytes = await blobBytes(score.pdfUrl);
		if (bytes) parts.push({ kind: "pdf", bytes });
	}
	for (const file of song.files) {
		const kind = file.kind ?? (/\.pdf$/i.test(file.filename) ? "pdf" : "image");
		if (kind !== "pdf" && kind !== "image") continue;
		const bytes = await blobBytes(file.url);
		if (bytes)
			parts.push({ kind, bytes, contentType: kind === "pdf" ? "application/pdf" : undefined });
	}
	return parts;
}

/** Edwin, the chart's font (static/fonts/barmark), decoded once from the bundled data URL. */
const EDWIN = Buffer.from(edwinDataUrl.slice(edwinDataUrl.indexOf(",") + 1), "base64");
const CHART_FONTS = {
	chord: "Edwin",
	text: "Helvetica",
	textBold: "Helvetica-Bold",
	textItalic: "Helvetica-Oblique",
};

/** Whether a chart has bars to draw; a chart of prose alone prints as markdown. */
const hasBars = (markdown: string): boolean =>
	layoutChart(markdown).blocks.some((b) =>
		b.items.some((i) => i.kind === "row" || i.kind === "system"),
	);

/** An A4 document with the pages `build` draws, as bytes; Edwin is registered for the chart. */
async function pdfBytes(build: (doc: PDFKit.PDFDocument) => void): Promise<Uint8Array> {
	const doc = new PDFDocument({ size: "A4", margin: 56, compress: true });
	doc.registerFont("Edwin", EDWIN);
	const chunks: Buffer[] = [];
	doc.on("data", (chunk: Buffer) => chunks.push(chunk));
	const done = new Promise<void>((resolve, reject) => {
		doc.on("end", resolve);
		doc.on("error", reject);
	});
	build(doc);
	doc.end();
	await done;
	return new Uint8Array(Buffer.concat(chunks));
}

/**
 * A song's documentation as one PDF: a title page (the title, the project
 * when given, the version), then a page or more per section that has
 * text, headed "Lyrics", "Chart" or "Notes", then the notation's pages
 * (`notationPartsOf`) when given (Kevin). Lyrics and notes render from
 * their markdown; a chart with bars is drawn as the engraved chart
 * (`chartToPdfPages`: bar grid, repeats, endings, chords in Edwin with
 * their ♯ and ♭), and a chart with none prints as markdown.
 */
export async function songDocumentationPdf(
	song: DocumentedSong,
	notation: PdfAppendix[] = [],
): Promise<Uint8Array> {
	const text = await pdfBytes((doc) => {
		doc
			.font("Helvetica-Bold")
			.fontSize(24)
			.text(song.title || "Untitled");
		doc.moveDown(0.3);
		doc.font("Helvetica").fontSize(13).fillColor("#555555");
		if (song.projectName) doc.text(song.projectName);
		if (song.version) doc.fontSize(10).text(`Version ${song.version}`);
		doc.fillColor("#000000");
		for (const section of documentedSections(song)) {
			doc.addPage();
			doc.font("Helvetica-Bold").fontSize(16).text(SECTION_TITLE[section]);
			doc.moveDown(0.6);
			drawSection(doc, section, textOf(song, section));
		}
	});
	return appendToPdf(text, notation);
}

/** A section's text on the page: the chart drawn when it has bars, everything else as markdown. */
function drawSection(doc: PDFKit.PDFDocument, section: DocumentationSection, text: string): void {
	if (section === "chart" && hasBars(text)) chartToPdfPages(doc, text, CHART_FONTS);
	else markdownToPdfPages(doc, text);
}

/** The song rows the project downloads work from, as `projectForDocumentation` returns them. */
type ProjectSong = NonNullable<
	Awaited<ReturnType<typeof projectForDocumentation>>
>["songs"][number];

export interface ProjectDownloadOptions {
	/** Which songs to include (the viewer may not see every song of a public project); all when absent. */
	includeSong?: (song: ProjectSong) => boolean;
}

/** `name.ext` → `name (2).ext` and on, until the name is free in `taken`; the name is then taken. */
function uniqueName(name: string, taken: Set<string>): string {
	const dot = name.lastIndexOf(".");
	const base = dot > 0 ? name.slice(0, dot) : name;
	const ext = dot > 0 ? name.slice(dot) : "";
	let candidate = name;
	for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${base} (${n})${ext}`;
	taken.add(candidate.toLowerCase());
	return candidate;
}

const extensionOf = (filename: string) =>
	filename.match(/\.([a-z0-9]+)$/i)?.[0].toLowerCase() ?? "";

/** The bytes of one of our blobs, or null when it is gone (the zip goes on without it). */
async function blobBytes(url: string): Promise<Uint8Array | null> {
	const res = await readBlob(url).catch(() => null);
	if (!res?.ok) return null;
	return new Uint8Array(await res.arrayBuffer());
}

/** Already-compressed media is stored as is; text deflates. */
const STORED = { level: 0 } as const;
const DEFLATED = { level: 6 } as const;

/**
 * A zip of `<song title>.pdf` for every song of the project that has any
 * lyrics, chart or notes (titles made safe as filenames, duplicates
 * numbered); null when no song has text or the project is not the account's.
 */
export async function projectDocumentationZip(
	accountId: string,
	projectId: string,
	{ includeSong }: ProjectDownloadOptions = {},
): Promise<Uint8Array | null> {
	const project = await projectForDocumentation(accountId, projectId);
	if (!project) return null;
	const entries: Zippable = {};
	const taken = new Set<string>();
	for (const song of project.songs) {
		if (includeSong && !includeSong(song)) continue;
		const notation = await notationPartsOf(song);
		if (!hasDocumentation(song, notation.length)) continue;
		const pdf = await songDocumentationPdf({ ...song, projectName: project.name }, notation);
		entries[uniqueName(`${safeFilename(song.title)}.pdf`, taken)] = [pdf, DEFLATED];
	}
	if (Object.keys(entries).length === 0) return null;
	return zipSync(entries);
}

/**
 * A zip of the project's charts, a folder per song named by its title:
 * every score's rendered PDF (`<title>.pdf`, once the jobs function has
 * engraved it) and its MusicXML file, every attachment marked as notation
 * under its own filename, and the chart text as `<song>.chart.md`
 * (barmark's canonical print, which barmark.dev and the editor open as a
 * chart), `<song>-chart.pdf` and, when the chart exports cleanly,
 * `<song>.musicxml` (`chartMusicXml`). Null when there is nothing to put in.
 */
export async function projectChartsZip(
	accountId: string,
	projectId: string,
	{ includeSong }: ProjectDownloadOptions = {},
): Promise<Uint8Array | null> {
	const project = await projectForDocumentation(accountId, projectId);
	if (!project) return null;
	const entries: Zippable = {};
	const folders = new Set<string>();
	for (const song of project.songs) {
		if (includeSong && !includeSong(song)) continue;
		const folder = uniqueName(safeFilename(song.title), folders);
		const names = new Set<string>();
		const add = (name: string, bytes: Uint8Array, level: typeof STORED | typeof DEFLATED) => {
			entries[`${folder}/${uniqueName(name, names)}`] = [bytes, level];
		};
		for (const score of song.notation) {
			const title = safeFilename(score.title || score.filename.replace(/\.[a-z0-9]+$/i, ""));
			const xml = await blobBytes(score.url);
			const ext = extensionOf(score.filename) || ".xml";
			if (xml) add(`${title}${ext}`, xml, ext === ".mxl" ? STORED : DEFLATED);
			if (score.pdfStatus === "ready" && score.pdfUrl) {
				const pdf = await blobBytes(score.pdfUrl);
				if (pdf) add(`${title}.pdf`, pdf, STORED);
			}
		}
		for (const file of song.files) {
			const bytes = await blobBytes(file.url);
			if (bytes) add(safeFilename(file.filename), bytes, STORED);
		}
		if (song.chartMarkdown.trim()) await addChartEntries(add, song, project.name);
	}
	if (Object.keys(entries).length === 0) return null;
	return zipSync(entries);
}

/**
 * A song's chart in its charts-zip folder: the text as `<song>.chart.md`
 * (barmark's canonical print), the chart alone as `<song>-chart.pdf`, and
 * `<song>.musicxml` when the chart exports cleanly (`chartMusicXml`: a
 * chart with an error to fix plays but does not export).
 */
async function addChartEntries(
	add: (name: string, bytes: Uint8Array, level: typeof STORED | typeof DEFLATED) => void,
	song: ProjectSong,
	projectName: string,
): Promise<void> {
	const stem = safeFilename(song.title);
	add(`${stem}.chart.md`, new TextEncoder().encode(printChart(song.chartMarkdown)), DEFLATED);
	add(
		`${stem}-chart.pdf`,
		await songDocumentationPdf({ ...song, projectName, sections: ["chart"] }),
		DEFLATED,
	);
	const xml = chartMusicXml(song.chartMarkdown, song.title);
	if (xml) add(`${stem}.musicxml`, new TextEncoder().encode(xml), DEFLATED);
}
