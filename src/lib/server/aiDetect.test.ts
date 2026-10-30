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
const { reconcileChordsWithAi } = await import("./aiDetect");

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
