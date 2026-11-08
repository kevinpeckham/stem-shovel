import { fireEvent, render, screen } from "@testing-library/svelte";
import type { TimingMap } from "@barmark/sync";
import { createRawSnippet } from "svelte";
import { describe, expect, test, vi } from "vite-plus/test";
import type { SongChange } from "#lib/val/SongChangeSchema.js";
import type { StemEngine } from "#lib/audio/engine.svelte.js";

/** The settings' Tempo & key tab over real state instances; the remote functions are never reached. */
const h = vi.hoisted(() => ({
	setChartTimingUse: vi.fn(async (input: unknown) => ({ input })),
	clearChartTiming: vi.fn(async (input: unknown) => ({ input })),
	useChartlessGrid: vi.fn(async (input: { startAt: number; bpm: number }) => ({
		startAt: input.startAt,
		bpm: input.bpm,
	})),
	refreshAll: vi.fn(async () => {}),
	notify: vi.fn(),
}));
vi.mock("#lib/remote/songs.remote.js", () => ({
	setChartTimingUse: h.setChartTimingUse,
	clearChartTiming: h.clearChartTiming,
	useChartlessGrid: h.useChartlessGrid,
}));
vi.mock("#lib/remote/files.remote.js", () => ({}));
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify: h.notify }));
vi.mock("$app/navigation", () => ({ refreshAll: h.refreshAll }));

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
		startAt: () => null,
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
		songId: song.id,
		timing: null as TimingMap | null,
		useTiming: false,
		savedChanges: [] as SongChange[],
		startAt: null as number | null,
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

	test("the chord card's hedge follows the chords' source", () => {
		const { props, chordDraft } = setup();
		chordDraft.chordSegments = [{ bar: 1, bars: 2, start: 0, chord: "D", confidence: 1 }];
		chordDraft.chordSource = "model";
		render(SongTempoKeyTab, { props });
		expect(screen.getByText(/Read from the mix by the chord model/)).toBeTruthy();
		expect(screen.queryByText(/A rough read/)).toBeNull();
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

	test("Bar timing without a map says how to make one, and offers nothing", () => {
		const { props } = setup();
		render(SongTempoKeyTab, { props });
		const block = document.querySelector("[data-chart-timing]")!;
		expect(block.textContent).toContain(
			"No timing map yet: draft a chart from the detected chords, or place the chart from the stems.",
		);
		expect(screen.queryByRole("button", { name: "Follow it" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Forget" })).toBeNull();
	});

	test("Bar timing with a map: Follow it, Following · Stop and Forget", async () => {
		const timing: TimingMap = {
			format: "barmark-timing",
			version: 1,
			chart: { bars: 2, hash: "h" },
			source: "aligned",
			bars: [
				{ bar: 1, start: 0 },
				{ bar: 2, start: 2 },
			],
			end: 4,
		};
		const { props } = setup();
		const view = render(SongTempoKeyTab, { props: { ...props, timing } });
		expect(screen.getByText("2 bars from the aligned chart.")).toBeTruthy();
		await fireEvent.click(screen.getByRole("button", { name: "Follow it" }));
		expect(h.setChartTimingUse).toHaveBeenCalledWith({ id: "song1", use: true });
		await vi.waitFor(() => expect(h.notify).toHaveBeenCalledWith("Following the chart's timing"));
		expect(h.refreshAll).toHaveBeenCalled();
		view.unmount();

		const declared: SongChange[] = [
			{ kind: "tempo", start: 0, value: "132" },
			{ kind: "meter", start: 0, value: "4/4" },
		];
		const withTempo = render(SongTempoKeyTab, {
			props: { ...props, timing, savedChanges: declared, startAt: 0 },
		});
		expect(
			screen.getByText(
				"2 bars from the aligned chart: bar 1 at 0:00, bars 2.0 s (the tempo says 1.82 s).",
			),
		).toBeTruthy();
		withTempo.unmount();

		render(SongTempoKeyTab, { props: { ...props, timing, useTiming: true } });
		await fireEvent.click(screen.getByRole("button", { name: "Following · Stop" }));
		expect(h.setChartTimingUse).toHaveBeenLastCalledWith({ id: "song1", use: false });
		vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
		await fireEvent.click(screen.getByRole("button", { name: "Forget" }));
		expect(h.clearChartTiming).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole("button", { name: "Forget" }));
		expect(h.clearChartTiming).toHaveBeenCalledWith({ id: "song1" });
		await vi.waitFor(() => expect(h.notify).toHaveBeenCalledWith("Timing map forgotten"));
	});
	test("Use as start of bar 1 writes the placement's bar one and tempo, then refreshes", async () => {
		const { changes, chordDraft, props } = setup();
		chordDraft.chordSegments = [{ bar: 1, bars: 3, start: 0.5, chord: "C", confidence: 1 }];
		chordDraft.placement = {
			barStarts: [0.5, 2.3, 4.1, 5.9],
			period: 1.8,
			beatsPerBar: 4,
			cls: 1,
			decided: true,
			byStart: false,
			witnesses: [],
		};
		const onstartset = vi.fn();
		render(SongTempoKeyTab, { props: { ...props, onstartset } });
		await fireEvent.click(screen.getByRole("button", { name: "Use as start of bar 1" }));
		expect(h.useChartlessGrid).toHaveBeenCalledWith({ id: "song1", startAt: 0.5, bpm: 133.33 });
		await vi.waitFor(() =>
			expect(h.notify).toHaveBeenCalledWith("Start of bar 1 set to 0:00.5, tempo 133.33 bpm"),
		);
		expect(h.refreshAll).toHaveBeenCalled();
		expect(onstartset).toHaveBeenCalledOnce();
		expect(changes.rows[0]!.value).toBe("120");
	});
});
