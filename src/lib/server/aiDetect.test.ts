import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const env = vi.hoisted(() => ({ AI_GATEWAY_API_KEY: "test-key" as string | undefined }));
vi.mock("varlock/env", () => ({ ENV: env }));
vi.mock("#lib/server/data.js", () => ({
	logAiRequest: vi.fn(async () => {}),
	saveChartRead: vi.fn(),
}));
vi.mock("#lib/server/blob.js", () => ({ readBlob: vi.fn() }));
vi.mock("#lib/server/redis.js", () => ({ redisConfigured: () => false, redisPipeline: vi.fn() }));
vi.mock("@ai-sdk/gateway", () => ({ createGateway: () => (model: string) => ({ model }) }));
vi.mock("ai", () => ({ generateText: vi.fn() }));

const { logAiRequest } = await import("#lib/server/data.js");
const { generateText } = await import("ai");
const { chartCacheKey, draftBarLines, readChartWithAi, reconcileChordsWithAi } =
	await import("./aiDetect");

const log = vi.mocked(logAiRequest);
const generate = vi.mocked(generateText);
const who = { userId: "u1", songId: "s1" };
const input = {
	key: "D major",
	meter: "4/4",
	tempo: "120",
	chords: ["D", "F#m", ""],
	bars: [
		{ bar: 1, notes: "D2×1.6@0.8" },
		{ bar: 2, notes: "B1×1.8@0.7 D3×1@0.4" },
		{ bar: 3, notes: "" },
	],
};
/** The gateway answers with this text. */
const answers = (text: string) =>
	generate.mockResolvedValue({ text, usage: { inputTokens: 100, outputTokens: 20 } } as never);

beforeEach(() => {
	vi.clearAllMocks();
	env.AI_GATEWAY_API_KEY = "test-key";
});

describe("draftBarLines", () => {
	const chords = [
		{ bar: 1, bars: 2, chord: "D" },
		{ bar: 3, bars: 1, chord: "A" },
	];
	it("the matcher's chords ride each bar's notes as a hint", () => {
		const bars = [
			{ bar: 1, notes: "D2×1.6@0.8" },
			{ bar: 2, notes: "" },
			{ bar: 3, notes: "A2×1@0.5" },
		];
		expect(draftBarLines({ chords, bars, source: "matcher" })).toBe(
			"bar 1 [matcher: D]: D2×1.6@0.8\nbar 2 [matcher: %]: \nbar 3 [matcher: A]: A2×1@0.5",
		);
	});
	it("the model's chords stand alone when the notes are not transcribed, one line per bar", () => {
		expect(draftBarLines({ chords, bars: [], source: "model" })).toBe(
			"bar 1 [model: D]: (not transcribed)\nbar 2 [model: %]: (not transcribed)\nbar 3 [model: A]: (not transcribed)",
		);
	});
	it("a bar with notes but no chord, and the bars run to the last of either list", () => {
		expect(
			draftBarLines({
				chords: [{ bar: 2, bars: 1, chord: "G" }],
				bars: [{ bar: 1, notes: "x" }],
				source: "matcher",
			}),
		).toBe("bar 1: x\nbar 2 [matcher: G]: ");
	});
});

describe("reconcileChordsWithAi", () => {
	it("a good answer: the corrected chords, logged as chord-reconcile", async () => {
		answers('Bar 2 has a B in the bass.\n{"chords": ["D", "Bm", "N.C."]}');
		await expect(reconcileChordsWithAi(input, who)).resolves.toEqual({
			chords: ["D", "Bm", "N.C."],
			error: null,
		});
		const request = generate.mock.calls[0][0] as unknown as Record<string, unknown>;
		expect(request.maxOutputTokens).toBe(16000);
		expect(request.model).toEqual({ model: "anthropic/claude-fable-5-1" });
		expect(String(request.system)).toMatch(/^You are a careful music copyist\./);
		expect(String(request.prompt)).toContain("Bar 3: detected N.C.; notes: (none)");
		expect(log).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: "chord-reconcile",
				userId: "u1",
				songId: "s1",
				parsed: { chords: ["D", "Bm", "N.C."] },
				error: null,
				inputTokens: 100,
				outputTokens: 20,
			}),
		);
	});
	it("a wrong bar count is an answer with no chords, not a throw", async () => {
		answers('{"chords": ["D", "Bm"]}');
		await expect(reconcileChordsWithAi(input, who)).resolves.toEqual({
			chords: null,
			error: "expected 3 bars, got 2",
		});
		expect(log).toHaveBeenCalledWith(
			expect.objectContaining({ parsed: null, error: "expected 3 bars, got 2" }),
		);
	});
	it("no JSON is an answer with no chords", async () => {
		answers("The chords look right to me.");
		await expect(reconcileChordsWithAi(input, who)).resolves.toEqual({
			chords: null,
			error: "no JSON in the answer",
		});
	});
	it("a transport failure is logged and thrown", async () => {
		generate.mockRejectedValue(new Error("gateway down"));
		await expect(reconcileChordsWithAi(input, who)).rejects.toThrow("gateway down");
		expect(log).toHaveBeenCalledWith(
			expect.objectContaining({ kind: "chord-reconcile", error: "gateway down" }),
		);
	});
});

describe("readChartWithAi", () => {
	const score = { url: "https://blob/score.pdf", filename: "score.pdf" };
	const bytes = new Uint8Array([37, 80, 68, 70]);
	const read = () => readChartWithAi(score, bytes, "application/pdf", who);

	it("asks for a barmark chart: directives, a cell per measure, repeats, endings, directions, marks", async () => {
		answers("# Song\nkey: F, time: 4/4, tempo: 120\n| F | C |");
		await read();
		const system = String((generate.mock.calls[0][0] as unknown as { system: string }).system);
		expect(system).toContain("key: <key>, time: <time signature>, tempo: <bpm>");
		expect(system).toContain("part: <the part you read");
		expect(system).toMatch(/Every measure of the score is written once, in order, as one cell/);
		expect(system).toContain("|1 G | G7 :|");
		expect(system).toContain("D.S. al Coda");
		expect(system).toContain("| @A | F | C |");
		expect(system).toContain("## Verse");
		expect(system).toMatch(/Lyrics are not text: leave them out/);
		expect(system).toMatch(/a final line beginning "Note:"/);
		expect(system).not.toMatch(/\bm<number>/);
	});

	it("a chart barmark plays passes, logged with its bar and error counts (a line with an error plays nothing)", async () => {
		const text = "# Song\nPart: Piano\nkey: F, tempo: 120\n| F | C | Xq7 |\n| Bb | F |";
		answers(`${text}\n`);
		await expect(read()).resolves.toBe(text);
		expect(log).toHaveBeenCalledWith(
			expect.objectContaining({ kind: "chart-read", parsed: { bars: 2, errors: 1 }, error: null }),
		);
	});

	it("an answer with no bar (the old measure lines, prose) is an error, logged and thrown", async () => {
		answers("m1 key F major 4/4: F\nm2: C");
		await expect(read()).rejects.toThrow("The model did not write the chart out");
		expect(log).toHaveBeenCalledWith(
			expect.objectContaining({ parsed: null, error: "The model did not write the chart out" }),
		);
	});

	it("caches under a new prefix, so a summary cached in the old form is never served", () => {
		expect(chartCacheKey(score.url)).toMatch(/^chart2:[0-9a-f]{32}$/);
	});
});
