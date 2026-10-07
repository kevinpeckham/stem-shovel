import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createHmac } from "node:crypto";
import { callRoute, jsonPost } from "../../../../tests/helpers/fakeApiEvent";
import { asSignedOut, fakeId, httpError } from "../../../../tests/helpers/fakeRequestEvent";

/**
 * The jobs function: only the app's own token (an HMAC of the auth secret)
 * opens it, the body is a JobSchema, and each kind dispatches to its render
 * function after the 202. `background` runs the work here and keeps the
 * promise, so a test can await it.
 */
const h = vi.hoisted(() => ({
	env: { BETTER_AUTH_SECRET: "s3cret-of-the-test" } as Record<string, string | undefined>,
	pending: [] as Promise<void>[],
	ensureOriginalMix: vi.fn(),
	ensureSongNotes: vi.fn(),
	traceTranscriptionDeps: vi.fn(),
	renderNotationPdf: vi.fn(),
	renderStems: vi.fn(),
	renderDemos: vi.fn(),
	renderRecordings: vi.fn(),
}));
vi.mock("varlock/env", () => ({ ENV: h.env, initVarlockEnv: () => {} }));
vi.mock("$app/environment", () => ({ dev: false, building: false, browser: false, version: "0" }));
vi.mock("$lib/server/background", () => ({
	background: (work: () => Promise<void>) => {
		h.pending.push(work());
	},
}));
vi.mock("$lib/server/mix", () => ({ ensureOriginalMix: h.ensureOriginalMix }));
vi.mock("$lib/server/notes", () => ({
	ensureSongNotes: h.ensureSongNotes,
	traceTranscriptionDeps: h.traceTranscriptionDeps,
}));
vi.mock("$lib/server/notationPdf", () => ({ renderNotationPdf: h.renderNotationPdf }));
vi.mock("$lib/server/transcode", () => ({
	renderStems: h.renderStems,
	renderDemos: h.renderDemos,
	renderRecordings: h.renderRecordings,
}));

const { POST } = await import("./+server");

/** The token src/lib/server/jobs.ts derives: the same HMAC over the same label. */
const TOKEN = createHmac("sha256", h.env.BETTER_AUTH_SECRET ?? "")
	.update("background-jobs")
	.digest("hex");
const A = fakeId("song-a");
const B = fakeId("song-b");

function post(body: unknown, bearer: string | null = TOKEN) {
	const request = jsonPost("/api/jobs", body);
	if (bearer !== null) request.headers.set("authorization", `Bearer ${bearer}`);
	return callRoute(POST, asSignedOut(), request);
}
const settled = () => Promise.all(h.pending.splice(0));

beforeEach(() => {
	vi.clearAllMocks();
	h.pending.length = 0;
});

describe("POST /api/jobs", () => {
	it("401 without a bearer token", async () => {
		await expect(post({ kind: "mix", ids: [A] }, null)).rejects.toMatchObject(httpError(401));
	});
	it("401 with the wrong token, even of the right length", async () => {
		await expect(post({ kind: "mix", ids: [A] }, "f".repeat(TOKEN.length))).rejects.toMatchObject(
			httpError(401),
		);
		expect(h.ensureOriginalMix).not.toHaveBeenCalled();
	});
	it("400 on a body that is not a job: unknown kind, no ids, ids that are not nanoids, bad JSON", async () => {
		await expect(post({ kind: "launder", ids: [A] })).rejects.toMatchObject(httpError(400));
		await expect(post({ kind: "mix", ids: [] })).rejects.toMatchObject(httpError(400));
		await expect(post({ kind: "mix", ids: ["../etc"] })).rejects.toMatchObject(httpError(400));
		await expect(post("{oops")).rejects.toMatchObject(httpError(400));
	});
	it("202 at once, then the mixes one after another", async () => {
		const res = await post({ kind: "mix", ids: [A, B] });
		expect(res.status).toBe(202);
		expect(await res.json()).toEqual({ accepted: "mix", count: 2 });
		await settled();
		expect(h.ensureOriginalMix.mock.calls).toEqual([[A], [B]]);
	});
	it("notes transcribe per song", async () => {
		await post({ kind: "notes", ids: [A] });
		await settled();
		expect(h.ensureSongNotes).toHaveBeenCalledWith(A);
	});
	it("stem, demo and recording playback render as one batch each", async () => {
		await post({ kind: "stem-playback", ids: [A, B] });
		await post({ kind: "demo-playback", ids: [A] });
		await post({ kind: "recording-playback", ids: [B] });
		await settled();
		expect(h.renderStems).toHaveBeenCalledWith([A, B]);
		expect(h.renderDemos).toHaveBeenCalledWith([A]);
		expect(h.renderRecordings).toHaveBeenCalledWith([B]);
	});
	it("a notation PDF engraves per file", async () => {
		await post({ kind: "notation-pdf", ids: [A] });
		await settled();
		expect(h.renderNotationPdf).toHaveBeenCalledWith(A);
		expect(h.traceTranscriptionDeps).not.toHaveBeenCalled();
	});
});
