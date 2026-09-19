import { describe, expect, test } from "vite-plus/test";
import { songWantsNotes } from "./songWantsNotes";

const keyOf = (stems: { id: string }[]) =>
	stems
		.map((s) => s.id)
		.sort()
		.join("+");
const stem = (
	id: string,
	over: Partial<Parameters<typeof songWantsNotes>[0]["stems"][number]> = {},
) => ({
	id,
	status: "ready",
	url: `https://x/${id}.wav`,
	playbackStatus: "ready" as const,
	playbackUrl: `https://x/${id}.m4a`,
	gain: 1,
	durationSeconds: 120,
	...over,
});
const song = (over: Partial<Parameters<typeof songWantsNotes>[0]> = {}) => ({
	noAi: false,
	notesKey: null,
	notesDoneSeconds: 0,
	notesStartedAt: null,
	project: { noAi: false },
	stems: [stem("a"), stem("b")],
	...over,
});

describe("songWantsNotes", () => {
	test("a song with ready stems and no notes wants them", () => {
		expect(songWantsNotes(song(), keyOf)).toBe(true);
	});
	test("finished notes for the current stems: nothing to do", () => {
		expect(songWantsNotes(song({ notesKey: "a+b", notesDoneSeconds: 120 }), keyOf)).toBe(false);
	});
	test("behind the stems' length: resume", () => {
		expect(songWantsNotes(song({ notesKey: "a+b", notesDoneSeconds: 60 }), keyOf)).toBe(true);
	});
	test("stems changed since the notes were made: start over", () => {
		expect(songWantsNotes(song({ notesKey: "a", notesDoneSeconds: 120 }), keyOf)).toBe(true);
	});
	test("no-AI songs and projects, stem-less songs, and songs still rendering are left alone", () => {
		expect(songWantsNotes(song({ noAi: true }), keyOf)).toBe(false);
		expect(songWantsNotes(song({ project: { noAi: true } }), keyOf)).toBe(false);
		expect(songWantsNotes(song({ stems: [] }), keyOf)).toBe(false);
		expect(
			songWantsNotes(song({ stems: [stem("a"), stem("b", { playbackStatus: "pending" })] }), keyOf),
		).toBe(false);
	});
	test("a run that started minutes ago is in flight; an old one is stuck and wants a restart", () => {
		const now = Date.now();
		expect(songWantsNotes(song({ notesStartedAt: new Date(now - 60_000) }), keyOf, now)).toBe(
			false,
		);
		expect(songWantsNotes(song({ notesStartedAt: new Date(now - 11 * 60_000) }), keyOf, now)).toBe(
			true,
		);
	});
});
