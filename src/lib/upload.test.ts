import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

/**
 * The browser half of every upload (src/lib/upload.ts) with Vercel Blob's
 * client and `fetch` doubled: each helper reserves, sends the bytes to the
 * reserved pathname in the reserved store under the content type its name
 * says, reports the right thing to the right "ready" route, and turns a
 * refusal into an Error carrying the server's message.
 */
const h = vi.hoisted(() => ({
	upload: vi.fn(),
	pdfThumbnail: vi.fn(),
	fetch: vi.fn(),
}));
vi.mock("@vercel/blob/client", () => ({ upload: h.upload }));
vi.mock("#lib/utils/pdfThumbnail.js", () => ({ pdfThumbnail: h.pdfThumbnail }));
vi.mock("#lib/audio/mono.js", () => ({ collapseDualMono: (b: unknown) => b }));
vi.mock("#lib/audio/peaks.js", () => ({
	PEAK_BINS: 4,
	computePeaks: () => new Float32Array([0, 0.5, 1, 0.25]),
}));
vi.stubGlobal("fetch", h.fetch);

const {
	uploadStemFile,
	uploadFile,
	uploadNotationFile,
	uploadDemoFile,
	uploadRecordingFile,
	uploadRecordingStemFile,
	uploadStudioSourceFile,
	uploadMidiFile,
	uploadDrumSampleFile,
	postJson,
	saveAs,
} = await import("./upload");

const BLOB = "https://store.public.blob.vercel-storage.com";
const file = (name: string, type = "") => new File(["abc"], name, { type });
/** What fetch answered with for each call: `[url, init]`, and the JSON of the body sent. */
const calls = () =>
	h.fetch.mock.calls.map(([url, init]) => ({
		url,
		method: (init as RequestInit)?.method,
		json:
			typeof (init as RequestInit)?.body === "string"
				? JSON.parse((init as RequestInit).body as string)
				: undefined,
	}));

beforeEach(() => {
	vi.resetAllMocks();
	h.upload.mockImplementation(
		async (
			pathname: string,
			_file: File,
			opts: { onUploadProgress?: (e: { percentage: number }) => void },
		) => {
			opts.onUploadProgress?.({ percentage: 42 });
			return { url: `${BLOB}/${pathname}` };
		},
	);
	h.fetch.mockImplementation(async () => Response.json({ ok: true }));
});

describe("uploadStemFile", () => {
	const ctx = {
		decodeAudioData: vi.fn(async () => ({ duration: 2.5, numberOfChannels: 2 })),
	} as unknown as AudioContext;
	it("reserves, uploads multipart with the extension's content type, decodes, and reports duration, channels and peaks", async () => {
		const reserve = vi.fn(async () => ({
			stemId: "stem-1",
			pathname: "accounts/a/songs/s/stem-1.wav",
		}));
		const progress: number[] = [];
		const onDecoding = vi.fn();
		const onDecoded = vi.fn();
		await uploadStemFile(file("Guitar.WAV"), reserve, {
			ctx,
			onProgress: (p) => progress.push(p),
			onDecoding,
			onDecoded,
		});
		expect(h.upload).toHaveBeenCalledWith(
			"accounts/a/songs/s/stem-1.wav",
			expect.any(File),
			expect.objectContaining({
				access: "public",
				handleUploadUrl: "/api/upload",
				contentType: "audio/wav",
				multipart: true,
			}),
		);
		expect(progress).toEqual([42]);
		expect(onDecoding).toHaveBeenCalledTimes(1);
		expect(onDecoded).toHaveBeenCalledWith(expect.objectContaining({ duration: 2.5 }));
		expect(calls()).toEqual([
			{
				url: "/api/stems/stem-1/ready",
				method: "POST",
				json: {
					url: `${BLOB}/accounts/a/songs/s/stem-1.wav`,
					durationSeconds: 2.5,
					channels: 2,
					peaks: [0, 0.5, 1, 0.25],
				},
			},
		]);
	});
	it("uploads into the private store when the reservation says so", async () => {
		await uploadStemFile(
			file("x.flac"),
			async () => ({ stemId: "s", pathname: "p.flac", access: "private" }),
			{ ctx },
		);
		expect(h.upload).toHaveBeenCalledWith(
			"p.flac",
			expect.any(File),
			expect.objectContaining({ access: "private", contentType: "audio/flac" }),
		);
	});
	it("throws the server's message when the ready report is refused", async () => {
		h.fetch.mockResolvedValueOnce(Response.json({ message: "Storage is full" }, { status: 413 }));
		await expect(
			uploadStemFile(file("x.wav"), async () => ({ stemId: "s", pathname: "p.wav" }), { ctx }),
		).rejects.toThrow("Storage is full");
		h.fetch.mockResolvedValueOnce(new Response("nope", { status: 502, statusText: "Bad Gateway" }));
		await expect(
			uploadStemFile(file("x.wav"), async () => ({ stemId: "s", pathname: "p.wav" }), { ctx }),
		).rejects.toThrow("502 Bad Gateway");
	});
});

describe("uploadFile", () => {
	it("sends a PDF with its first page and page count as a form, and answers the share code and kind", async () => {
		h.pdfThumbnail.mockResolvedValue({
			image: new Blob(["img"], { type: "image/webp" }),
			pageCount: 7,
		});
		h.fetch.mockResolvedValueOnce(Response.json({ shareCode: "abc", kind: "pdf" }));
		const out = await uploadFile(file("chart.pdf"), async () => ({
			fileId: "f1",
			pathname: "accounts/a/files/f1.pdf",
			kind: "pdf",
		}));
		expect(out).toEqual({ shareCode: "abc", kind: "pdf" });
		expect(h.upload).toHaveBeenCalledWith(
			"accounts/a/files/f1.pdf",
			expect.any(File),
			expect.objectContaining({ contentType: "application/pdf", multipart: true }),
		);
		const [url, init] = h.fetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("/api/files/f1/ready");
		const form = init.body as FormData;
		expect(form.get("url")).toBe(`${BLOB}/accounts/a/files/f1.pdf`);
		expect(form.get("pageCount")).toBe("7");
		expect((form.get("thumbnail") as File).name).toBe("page-1.webp");
	});
	it("sends no thumbnail for another kind, or when the PDF could not be rendered", async () => {
		h.pdfThumbnail.mockRejectedValue(new Error("no worker"));
		h.fetch.mockImplementation(async () => Response.json({ shareCode: "x", kind: "pdf" }));
		await uploadFile(file("a.pdf"), async () => ({ fileId: "f", pathname: "p.pdf", kind: "pdf" }));
		await uploadFile(file("a.png"), async () => ({
			fileId: "g",
			pathname: "p.png",
			kind: "image",
		}));
		for (const [, init] of h.fetch.mock.calls as [string, RequestInit][]) {
			const form = init.body as FormData;
			expect(form.has("thumbnail")).toBe(false);
			expect(form.has("pageCount")).toBe(false);
		}
		expect(h.pdfThumbnail).toHaveBeenCalledTimes(1);
	});
});

describe("uploadNotationFile", () => {
	it("names the MusicXML type from the extension, sends the caller's thumbnail, and keeps going without one", async () => {
		h.fetch.mockImplementation(async () => Response.json({ shareCode: "n1" }));
		const thumbnail = vi.fn(async () => ({ blob: new Blob(["i"]), pageCount: 2 }));
		expect(
			await uploadNotationFile(
				file("lead.mxl"),
				async () => ({ notationId: "n", pathname: "p.mxl" }),
				undefined,
				thumbnail,
			),
		).toEqual({ shareCode: "n1" });
		expect(h.upload).toHaveBeenCalledWith(
			"p.mxl",
			expect.any(File),
			expect.objectContaining({ contentType: "application/vnd.recordare.musicxml" }),
		);
		let form = (h.fetch.mock.calls[0] as [string, RequestInit])[1].body as FormData;
		expect(form.get("pageCount")).toBe("2");
		expect(form.has("thumbnail")).toBe(true);

		await uploadNotationFile(
			file("lead.musicxml"),
			async () => ({ notationId: "n", pathname: "p.musicxml" }),
			undefined,
			async () => {
				throw new Error("render failed");
			},
		);
		expect(h.upload).toHaveBeenLastCalledWith(
			"p.musicxml",
			expect.any(File),
			expect.objectContaining({ contentType: "application/vnd.recordare.musicxml+xml" }),
		);
		form = (h.fetch.mock.calls[1] as [string, RequestInit])[1].body as FormData;
		expect(form.has("thumbnail")).toBe(false);
		expect(h.fetch.mock.calls[1][0]).toBe("/api/notation/n/ready");
	});
});

describe("the simple reserve → upload → ready helpers", () => {
	it("uploadDemoFile reports the URL alone", async () => {
		await uploadDemoFile(file("Voice Memo.m4a"), async () => ({ demoId: "d1", pathname: "p.m4a" }));
		expect(h.upload).toHaveBeenCalledWith(
			"p.m4a",
			expect.any(File),
			expect.objectContaining({ contentType: "audio/mp4", multipart: true }),
		);
		expect(calls()).toEqual([
			{ url: "/api/demos/d1/ready", method: "POST", json: { url: `${BLOB}/p.m4a` } },
		]);
	});
	it("uploadRecordingFile reports the URL and the timed length, and answers the take's id and number", async () => {
		const progress: number[] = [];
		expect(
			await uploadRecordingFile(
				file("take.webm"),
				async () => ({ recordingId: "r1", takeNumber: 4, pathname: "p.webm", access: "private" }),
				9.5,
				(p) => progress.push(p),
			),
		).toEqual({ recordingId: "r1", takeNumber: 4 });
		expect(progress).toEqual([42]);
		expect(h.upload).toHaveBeenCalledWith(
			"p.webm",
			expect.any(File),
			expect.objectContaining({ access: "private" }),
		);
		expect(calls()).toEqual([
			{
				url: "/api/recordings/r1/ready",
				method: "POST",
				json: { url: `${BLOB}/p.webm`, durationSeconds: 9.5 },
			},
		]);
	});
	it("uploadRecordingStemFile reserves the source under its take with label, order, codec and size, then reports it ready", async () => {
		h.fetch
			.mockResolvedValueOnce(
				Response.json({ stemId: "rs1", pathname: "accounts/a/recordings/r1/rs1.wav" }),
			)
			.mockResolvedValueOnce(Response.json({ ok: true }));
		expect(
			await uploadRecordingStemFile(
				"r1",
				file("piano.wav"),
				{ label: "Piano", sortOrder: 1, codec: "pcm" },
				9.5,
			),
		).toEqual({ stemId: "rs1" });
		expect(calls()).toEqual([
			{
				url: "/api/recordings/r1/stems",
				method: "POST",
				json: { label: "Piano", sortOrder: 1, codec: "pcm", filename: "piano.wav", sizeBytes: 3 },
			},
			{
				url: "/api/recording-stems/rs1/ready",
				method: "POST",
				json: { url: `${BLOB}/accounts/a/recordings/r1/rs1.wav`, durationSeconds: 9.5 },
			},
		]);
	});
	it("uploadStudioSourceFile sends the WAV and reports the URL with the peaks and length", async () => {
		expect(
			await uploadStudioSourceFile(
				file("guitar.wav"),
				async () => ({ sourceId: "src1", pathname: "p.wav" }),
				{ peaks: [0, 1], durationSeconds: 3 },
			),
		).toEqual({ sourceId: "src1" });
		expect(h.upload).toHaveBeenCalledWith(
			"p.wav",
			expect.any(File),
			expect.objectContaining({ contentType: "audio/wav" }),
		);
		expect(calls()).toEqual([
			{
				url: "/api/studio/sources/src1/ready",
				method: "POST",
				json: { url: `${BLOB}/p.wav`, peaks: [0, 1], durationSeconds: 3 },
			},
		]);
	});
	it("uploadMidiFile reserves on the stem by name and size, uploads as audio/midi in one part, and reports the URL", async () => {
		h.fetch
			.mockResolvedValueOnce(Response.json({ stemId: "s1", pathname: "accounts/a/songs/s/s1.mid" }))
			.mockResolvedValueOnce(Response.json({ ok: true }));
		await uploadMidiFile("s1", file("part.mid"));
		expect(h.upload).toHaveBeenCalledWith(
			"accounts/a/songs/s/s1.mid",
			expect.any(File),
			expect.objectContaining({ contentType: "audio/midi" }),
		);
		expect((h.upload.mock.calls[0][2] as { multipart?: boolean }).multipart).toBeUndefined();
		expect(calls()).toEqual([
			{ url: "/api/stems/s1/midi", method: "POST", json: { filename: "part.mid", sizeBytes: 3 } },
			{
				url: "/api/stems/s1/midi/ready",
				method: "POST",
				json: { url: `${BLOB}/accounts/a/songs/s/s1.mid` },
			},
		]);
	});
	it("uploadDrumSampleFile reports the URL", async () => {
		await uploadDrumSampleFile(file("kick.wav"), async () => ({
			sampleId: "k1",
			pathname: "p.wav",
		}));
		expect(calls()).toEqual([
			{ url: "/api/drum-samples/k1/ready", method: "POST", json: { url: `${BLOB}/p.wav` } },
		]);
	});
	it("each helper throws the server's message when the ready report is refused", async () => {
		const refused = () =>
			h.fetch.mockResolvedValueOnce(Response.json({ error: "Not yours" }, { status: 404 }));
		refused();
		await expect(
			uploadDemoFile(file("a.m4a"), async () => ({ demoId: "d", pathname: "p" })),
		).rejects.toThrow("Not yours");
		refused();
		await expect(
			uploadRecordingFile(
				file("a.webm"),
				async () => ({ recordingId: "r", takeNumber: 1, pathname: "p" }),
				1,
			),
		).rejects.toThrow("Not yours");
		refused();
		await expect(
			uploadStudioSourceFile(file("a.wav"), async () => ({ sourceId: "s", pathname: "p" }), {
				peaks: [],
				durationSeconds: 1,
			}),
		).rejects.toThrow("Not yours");
		refused();
		await expect(
			uploadDrumSampleFile(file("a.wav"), async () => ({ sampleId: "k", pathname: "p" })),
		).rejects.toThrow("Not yours");
		expect(h.upload).toHaveBeenCalledTimes(4);
	});
});

describe("postJson", () => {
	it("posts JSON and answers the parsed body", async () => {
		h.fetch.mockResolvedValueOnce(Response.json({ id: 7 }));
		expect(await postJson<{ id: number }>("/api/x", { a: 1 })).toEqual({ id: 7 });
		expect(calls()).toEqual([{ url: "/api/x", method: "POST", json: { a: 1 } }]);
		expect((h.fetch.mock.calls[0][1] as RequestInit).headers).toEqual({
			"content-type": "application/json",
		});
	});
	it("throws the server's message, its error, or the status line", async () => {
		h.fetch.mockResolvedValueOnce(Response.json({ message: "Sign in first" }, { status: 401 }));
		await expect(postJson("/api/x", {})).rejects.toThrow("Sign in first");
		h.fetch.mockResolvedValueOnce(Response.json({ error: "bad" }, { status: 400 }));
		await expect(postJson("/api/x", {})).rejects.toThrow("bad");
		h.fetch.mockResolvedValueOnce(
			new Response("<html>", { status: 503, statusText: "Service Unavailable" }),
		);
		await expect(postJson("/api/x", {})).rejects.toThrow("503 Service Unavailable");
	});
});

describe("saveAs", () => {
	it("fetches the file and clicks an object-URL link named as asked, revoking the URL later", async () => {
		vi.useFakeTimers();
		const a = { href: "", download: "", click: vi.fn() };
		vi.stubGlobal("document", { createElement: vi.fn(() => a) });
		const createObjectURL = vi.fn(() => "blob:local/1");
		const revokeObjectURL = vi.fn();
		vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
		h.fetch.mockResolvedValueOnce(new Response("bytes", { status: 200 }));
		await saveAs("https://store/x.wav", "Guitar.wav");
		expect(h.fetch).toHaveBeenCalledWith("https://store/x.wav");
		expect(a).toMatchObject({ href: "blob:local/1", download: "Guitar.wav" });
		expect(a.click).toHaveBeenCalledTimes(1);
		expect(revokeObjectURL).not.toHaveBeenCalled();
		vi.advanceTimersByTime(60_000);
		expect(revokeObjectURL).toHaveBeenCalledWith("blob:local/1");
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.stubGlobal("fetch", h.fetch);
	});
	it("throws the status line when the file cannot be fetched", async () => {
		h.fetch.mockResolvedValueOnce(new Response(null, { status: 403, statusText: "Forbidden" }));
		await expect(saveAs("https://store/x.wav", "x")).rejects.toThrow("403 Forbidden");
	});
});
