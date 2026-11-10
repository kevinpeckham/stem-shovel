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
const { chartCacheKey, draftBarLines, draftChartWithAi, readChartWithAi, reconcileChordsWithAi } =
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
	it("one line per bar with its notes, through the starting chart's last bar", () => {
		const bars = [
			{ bar: 1, notes: "D2×1.6@0.8" },
			{ bar: 3, notes: "A2×1@0.5" },
		];
		expect(draftBarLines({ bars, barCount: 4 })).toBe(
			"bar 1: D2×1.6@0.8\nbar 2: \nbar 3: A2×1@0.5\nbar 4: ",
		);
	});
	it("every bar says so when the notes are not transcribed yet", () => {
		expect(draftBarLines({ bars: [], barCount: 2 })).toBe(
			"bar 1: (not transcribed)\nbar 2: (not transcribed)",
		);
	});
	it("notes past the chart's last bar still get their lines", () => {
		expect(draftBarLines({ bars: [{ bar: 2, notes: "x" }], barCount: 1 })).toBe(
			"bar 1: \nbar 2: x",
		);
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

	it("caches under a prefix and the prompt, so a read cached before a prompt change is never served", () => {
		expect(chartCacheKey(score.url)).toMatch(/^chart3:[0-9a-f]{32}$/);
	});

	it("measures that divide unevenly are read once more as beat slots; the second answer replaces the first when it is better", async () => {
		const first = "# Song\nkey: Bbm, time: 4/4\n| Db7 C7 Bm7 | Bbm7 |";
		const second = "# Song\nkey: Bbm, time: 4/4\n| Db7 / / C7_Bm7 | Bbm7 |";
		generate
			.mockResolvedValueOnce({ text: first, usage: {} } as never)
			.mockResolvedValueOnce({ text: second, usage: {} } as never);
		await expect(read()).resolves.toBe(second);
		expect(generate).toHaveBeenCalledTimes(2);
		const again = generate.mock.calls[1]![0] as { messages: { role: string; content: unknown }[] };
		expect(again.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
		expect(again.messages[2]!.content).toContain("Line 3: | Db7 C7 Bm7 | Bbm7 |");
		expect(log).toHaveBeenCalledWith(
			expect.objectContaining({ kind: "chart-read-beats", error: null }),
		);
	});

	it("a second read that is no better is dropped, and the first kept", async () => {
		const first = "# Song\nkey: Bbm, time: 4/4\n| Db7 C7 Bm7 | Bbm7 |";
		generate.mockResolvedValueOnce({ text: first, usage: {} } as never).mockResolvedValueOnce({
			text: "# Song\nkey: Bbm, time: 4/4\n| Db7 C7 Bm7 |",
			usage: {},
		} as never);
		await expect(read()).resolves.toBe(first);
		expect(log).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: "chart-read-beats",
				error: "The second read was no better; the first is kept",
			}),
		);
	});
});

describe("draftChartWithAi", () => {
	const draftInput = {
		title: "Track",
		tempo: "120",
		key: "D major",
		meter: "4/4",
		existingSections: [],
		bars: [{ bar: 1, notes: "D2" }],
		source: "model" as const,
		startingChart: "key: D, time: 4/4, tempo: 120\n\n| D | G |",
		barCount: 2,
		examples: [],
	};

	it("an answer empty twice is a DraftStoppedError carrying the gateway's finish reason, both tries logged with it", async () => {
		generate.mockResolvedValue({ text: "", finishReason: "content-filter", usage: {} } as never);
		await expect(draftChartWithAi(draftInput, who)).rejects.toMatchObject({
			name: "DraftStoppedError",
			reason: "content-filter",
		});
		expect(generate).toHaveBeenCalledTimes(2);
		expect(log).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: "chart-draft",
				error: "The model returned an empty completion (finish reason: content-filter); retried",
			}),
		);
		expect(log).toHaveBeenLastCalledWith(
			expect.objectContaining({
				error: "The model returned an empty completion (finish reason: content-filter)",
			}),
		);
	});

	it("an answer empty once and then written is the written one", async () => {
		generate
			.mockResolvedValueOnce({ text: "", finishReason: "other", usage: {} } as never)
			.mockResolvedValueOnce({
				text: '{"chords":"D G","sections":[{"name":"Verse","bar":1}],"progressions":[],"chart":"| D | G |","notes":""}',
				finishReason: "stop",
				usage: {},
			} as never);
		await expect(draftChartWithAi(draftInput, who)).resolves.toMatchObject({ chart: "| D | G |" });
	});
});
