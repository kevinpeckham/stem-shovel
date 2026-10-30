import { render, screen } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { describe, expect, test, vi } from "vite-plus/test";
import type { StemEngine } from "#lib/audio/engine.svelte.js";

/** The settings' Tempo & key tab over real state instances; the remote functions are never reached. */
vi.mock("#lib/remote/songs.remote.js", () => ({}));
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify: vi.fn() }));

const { default: SongTempoKeyTab } = await import("./SongTempoKeyTab.svelte");
const { SongChanges } = await import("#lib/state/songChanges.svelte.js");
const { SongCheck } = await import("#lib/state/songCheck.svelte.js");
const { SongChordDraft } = await import("#lib/state/songChordDraft.svelte.js");

function setup() {
	const song = {
		id: "song1",
		changes: [{ kind: "tempo" as const, start: 0, value: "120" }],
		sections: [],
		startAt: null,
	};
	const engine = null as StemEngine | null;
	const changes = new SongChanges({
		song: () => song,
		posCtx: () => ({ fps: 25, grid: null }),
		onsaved: async () => {},
	});
	const chordDraft = new SongChordDraft({
		songId: () => song.id,
		engine: () => engine,
		grid: () => null,
		aiAvailable: () => true,
	});
	const check = new SongCheck({
		song: () => song,
		engine: () => engine,
		aiAvailable: () => true,
		hasScore: () => true,
		changes,
		onsaved: async () => {},
		showTab: () => {},
	});
	changes.reset();
	const props = {
		changes,
		chordDraft,
		check,
		engine,
		grid: null,
		hasScore: true,
		aiAvailable: true,
		noAi: false,
		canReview: false,
		onreview: () => {},
		draftCard: createRawSnippet(() => ({ render: () => "<div>draft card</div>" })),
	};
	return { changes, chordDraft, check, props };
}

describe("SongTempoKeyTab", () => {
	test("the actions and the song's rows; Scan and Detect wait for the stems", () => {
		const { props } = setup();
		render(SongTempoKeyTab, { props });
		expect(screen.getByRole("button", { name: "Scan stems" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Detect chords" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Ask AI to check" })).toBeEnabled();
		expect(screen.getByRole("button", { name: "Add change" })).toBeEnabled();
		expect(screen.getByLabelText("Value")).toHaveValue("120");
	});

	test("the chord card, with its hedge, when the draft has chords; the draft card when it has a draft", () => {
		const { props, chordDraft } = setup();
		chordDraft.chordSegments = [{ bar: 1, bars: 2, start: 0, chord: "D", confidence: 1 }];
		chordDraft.draft = {
			sections: [],
			progressions: [],
			chords: "",
			chart: "",
			notes: "",
			chartHtml: "",
		};
		render(SongTempoKeyTab, { props });
		expect(screen.getByRole("button", { name: "Draft chart with AI" })).toBeEnabled();
		expect(screen.getByText(/A rough read: on a real recording about half the bars/)).toBeTruthy();
		expect(screen.getByText("draft card")).toBeTruthy();
	});

	test("the song-check card when the AI has answered", () => {
		const { props, check } = setup();
		check.aiAnswer = {
			tempo: 96,
			tempoChanges: [],
			meter: "4/4",
			key: "C major",
			keyChanges: [],
			notes: "",
		};
		render(SongTempoKeyTab, { props });
		expect(screen.getByText(/The AI read the chart and listened/)).toBeTruthy();
		expect(screen.getByText("96 bpm · C major · 4/4")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Use these" })).toBeEnabled();
	});
});
