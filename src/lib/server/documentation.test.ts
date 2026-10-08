import { unzipSync } from "fflate";
import { describe, expect, test, vi } from "vite-plus/test";

/** The project as `projectForDocumentation` would return it, and the blobs `readBlob` would read. */
const fake = vi.hoisted(() => {
	const blobs: Record<string, string> = {
		"https://x.public.blob.vercel-storage.com/score.mxl": "PK-mxl-bytes",
		"https://x.public.blob.vercel-storage.com/score.pdf": "%PDF-score",
		"https://x.public.blob.vercel-storage.com/chart.png": "PNG-bytes",
	};
	const song = (
		id: string,
		title: string,
		docs: Partial<{ lyricsMarkdown: string; chartMarkdown: string; notesMarkdown: string }>,
		extra: Partial<{ notation: unknown[]; files: unknown[] }> = {},
	) => ({
		id,
		projectId: "p1",
		isPrivate: false,
		title,
		slug: title.toLowerCase(),
		version: "0.0.1",
		lyricsMarkdown: "",
		chartMarkdown: "",
		notesMarkdown: "",
		notation: [],
		files: [],
		...docs,
		...extra,
	});
	const state = {
		project: null as null | {
			id: string;
			name: string;
			slug: string;
			isPrivate: boolean;
			isRestricted: boolean;
			songs: ReturnType<typeof song>[];
		},
	};
	return { blobs, song, state };
});
vi.mock("#lib/server/data.js", () => ({
	projectForDocumentation: vi.fn(async () => fake.state.project),
}));
vi.mock("#lib/server/blob.js", () => ({
	readBlob: vi.fn(async (url: string) => {
		const body = fake.blobs[url];
		return body ? new Response(body) : new Response(null, { status: 404 });
	}),
}));

const { projectChartsZip, projectDocumentationZip, songDocumentationPdf, hasDocumentation } =
	await import("./documentation");

const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1");
const pageObjects = (pdf: string) => pdf.match(/\/Type\s*\/Page\b/g)?.length ?? 0;

describe("songDocumentationPdf", () => {
	test("a title page, then a page per section that has text", async () => {
		const pdf = await songDocumentationPdf({
			title: "Blue in Green",
			projectName: "Kind of Blue",
			version: "1.2.0",
			lyricsMarkdown: "# Verse\n\nSoftly now",
			chartMarkdown: "",
			notesMarkdown: "- bring the Rhodes",
		});
		expect(latin1(pdf.subarray(0, 5))).toBe("%PDF-");
		// Title, Lyrics, Notes: the empty chart gets no page.
		expect(pageObjects(latin1(pdf))).toBe(3);
	});
	test("knows when there is nothing to print", () => {
		expect(
			hasDocumentation({ title: "x", lyricsMarkdown: " ", chartMarkdown: "", notesMarkdown: "" }),
		).toBe(false);
		expect(
			hasDocumentation({ title: "x", lyricsMarkdown: "", chartMarkdown: "C", notesMarkdown: "" }),
		).toBe(true);
	});
});

describe("projectDocumentationZip", () => {
	test("one PDF per song with text, titles made safe and de-duplicated", async () => {
		fake.state.project = {
			id: "p1",
			name: "Kind of Blue",
			slug: "kind-of-blue",
			isPrivate: false,
			isRestricted: false,
			songs: [
				fake.song("s1", "So What", { lyricsMarkdown: "la" }),
				fake.song("s2", "So What", { chartMarkdown: "Dm7" }),
				fake.song("s3", "Freddie/Freeloader?", { notesMarkdown: "n" }),
				fake.song("s4", "Silent", {}),
			],
		};
		const zip = await projectDocumentationZip("a1", "p1");
		expect(zip).not.toBeNull();
		expect(latin1(zip!.subarray(0, 2))).toBe("PK");
		const entries = unzipSync(zip!);
		expect(Object.keys(entries).sort()).toEqual([
			"Freddie Freeloader.pdf",
			"So What (2).pdf",
			"So What.pdf",
		]);
		expect(latin1(entries["So What.pdf"]!.subarray(0, 5))).toBe("%PDF-");
	});
	test("leaves out the songs the viewer may not see, and is null with nothing left", async () => {
		fake.state.project = {
			id: "p1",
			name: "Kind of Blue",
			slug: "kind-of-blue",
			isPrivate: false,
			isRestricted: false,
			songs: [fake.song("s1", "So What", { lyricsMarkdown: "la" })],
		};
		expect(await projectDocumentationZip("a1", "p1", { includeSong: () => false })).toBeNull();
		fake.state.project = null;
		expect(await projectDocumentationZip("a1", "p1")).toBeNull();
	});
});

describe("projectChartsZip", () => {
	test("a folder per song: scores as MusicXML and PDF, notation files, the chart as text and PDF", async () => {
		fake.state.project = {
			id: "p1",
			name: "Kind of Blue",
			slug: "kind-of-blue",
			isPrivate: false,
			isRestricted: false,
			songs: [
				fake.song(
					"s1",
					"So What",
					{ chartMarkdown: "Dm7 | Dm7 | Ebm7" },
					{
						notation: [
							{
								id: "n1",
								title: "Lead sheet",
								filename: "so-what.mxl",
								url: "https://x.public.blob.vercel-storage.com/score.mxl",
								pdfUrl: "https://x.public.blob.vercel-storage.com/score.pdf",
								pdfStatus: "ready",
							},
							{
								id: "n2",
								title: "Gone",
								filename: "gone.musicxml",
								url: "https://x.public.blob.vercel-storage.com/missing.musicxml",
								pdfUrl: null,
								pdfStatus: "pending",
							},
						],
						files: [
							{
								id: "f1",
								title: "Whiteboard",
								filename: "chart.png",
								url: "https://x.public.blob.vercel-storage.com/chart.png",
							},
						],
					},
				),
				fake.song("s2", "Blue in Green", {}),
			],
		};
		const zip = await projectChartsZip("a1", "p1");
		expect(zip).not.toBeNull();
		expect(latin1(zip!.subarray(0, 2))).toBe("PK");
		const entries = unzipSync(zip!);
		// The missing MusicXML file is skipped; a song with no charts gets no folder.
		expect(Object.keys(entries).sort()).toEqual([
			"So What/Lead sheet.mxl",
			"So What/Lead sheet.pdf",
			"So What/So What-chart.pdf",
			"So What/So What-chart.txt",
			"So What/chart.png",
		]);
		expect(latin1(entries["So What/Lead sheet.mxl"]!)).toBe("PK-mxl-bytes");
		expect(latin1(entries["So What/So What-chart.txt"]!)).toBe("Dm7 | Dm7 | Ebm7");
		expect(latin1(entries["So What/So What-chart.pdf"]!.subarray(0, 5))).toBe("%PDF-");
	});
	test("null when no song has a chart of any kind", async () => {
		fake.state.project = {
			id: "p1",
			name: "Kind of Blue",
			slug: "kind-of-blue",
			isPrivate: false,
			isRestricted: false,
			songs: [fake.song("s1", "So What", { lyricsMarkdown: "words only" })],
		};
		expect(await projectChartsZip("a1", "p1")).toBeNull();
	});
});
