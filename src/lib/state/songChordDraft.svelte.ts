import { extractFeatures } from "#lib/audio/analysis.js";
import { chordsPerBar, describeBars, type ChordSegment, type Note } from "#lib/audio/chords.js";
import type { StemEngine } from "#lib/audio/engine.svelte.js";
import type { ChartlessGrid } from "#lib/audio/chartlessGrid.js";
import { chartlessGridInBrowser } from "#lib/audio/chartlessGridInBrowser.js";
import { barSecondsAt, beatsPerBarAt, secondsAtBar, type BarGrid } from "#lib/audio/measures.js";
import { chartFromScore } from "#lib/remote/files.remote.js";
import {
	draftChart,
	reconcileChords,
	saveChartDraft,
	saveSections,
	songChords,
	songNotes,
	useChartlessGrid,
} from "#lib/remote/songs.remote.js";
import {
	BarOneError,
	chordDraftErrorMessage,
	ChordsError,
	DraftError,
	GridError,
	ModelNotReady,
	PlacementError,
	SaveError,
} from "#lib/state/chordDraftErrors.js";
import { notify } from "#lib/state/notifications.svelte.js";
import { alignmentFeaturesKey } from "#lib/utils/alignmentFeaturesKey.js";
import { chartDraftOfScore } from "#lib/utils/chartDraftOfScore.js";
import { chartlessGridUse } from "#lib/utils/chartlessGridUse.js";
import { chordminiBarChords } from "#lib/utils/chordminiBarChords.js";
import type { ChordminiRuns } from "#lib/utils/chordminiRuns.js";
import { errorMessage } from "#lib/utils/errorMessage.js";
import { generatedChartLine } from "#lib/utils/generatedChartLine.js";
import { reconciledSegments } from "#lib/utils/reconciledSegments.js";
import type { ChartDraftAnswer } from "#lib/val/ChartDraftSchema.js";
import type { ConfidenceRecord, TimingMap } from "@barmark/sync";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Schedule from "effect/Schedule";

/** What a score's import could not carry over, as the package words it (@barmark/musicxml's diagnostics). */
export interface ScoreDiagnostic {
	level: "error" | "warning";
	message: string;
}

/**
 * "Chart from score" (`chartFromScore`, the notation tile's ⋯ menu): the
 * imported chart and the tile's name as `source`; for a score without chord
 * symbols an empty chart and the parts it could be charted from, and once
 * one is, its name.
 */
export interface ScoreChart {
	chart: string;
	chartHtml: string;
	diagnostics: ScoreDiagnostic[];
	source: string;
	notationId: string;
	parts: string[];
	partName?: string;
}

/**
 * The draft card's draft: the AI's (no `source`, or "ai"), the chart built
 * from the detected chords when the AI is not at hand ("built"), or a
 * score's import ("score", with its name). The diagnostics are the builder's
 * or the import's; a drafted chart carries its timing map and confidence
 * (@barmark/sync), saved beside it.
 */
export type ChartDraft = ChartDraftAnswer & {
	chartHtml: string;
	source?: "ai" | "built" | "score";
	scoreName?: string;
	diagnostics?: ScoreDiagnostic[];
	timing?: TimingMap | null;
	confidence?: ConfidenceRecord | null;
	/** A score's: the notation file, the parts the card offers when the chart is empty, the part charted. */
	notationId?: string;
	parts?: string[];
	partName?: string;
};

/** What the page supplies: functions, since each follows the page's data and the player. */
export interface SongChordDraftOptions {
	songId: () => string;
	/** The Stem Player's engine, once it has mounted. */
	engine: () => StemEngine | null;
	/** The song's bar grid (null without a tempo and a time signature). */
	grid: () => BarGrid | null;
	/** Whether the AI is at hand for this song. */
	aiAvailable: () => boolean;
	/** The song's own start of bar 1 (null when it has none): the chartless grid places bar one there. */
	startAt: () => number | null;
	/**
	 * "Generate chart": a tempo and a time signature for a song without them
	 * (the page scans the stems); whether the song has a grid afterwards.
	 */
	ensureGrid: () => Promise<boolean>;
	/** After "Generate chart" saved to the song (the page refreshes and resets the settings' rows). */
	onsaved: () => Promise<void>;
	/** The song has sections already: "Generate chart" keeps them. */
	hasSections: () => boolean;
}

/**
 * A promise as an Effect, its rejection kept as the error. A thunk that takes
 * the signal sees it aborted when the run is interrupted (Effect passes it
 * only to a thunk that declares the parameter).
 */
const attempt = <A>(thunk: (signal: AbortSignal) => PromiseLike<A>) =>
	Effect.tryPromise({ try: thunk, catch: (e) => e });

/** How often, and for how long, a run waits for the chord model to read a song's mix on the server. */
const MODEL_POLL_SECONDS = 3;
/** How long a posted job may take to claim the song before the page stops waiting for it. */
const MODEL_CLAIM_SECONDS = 9;
const MODEL_WAIT_SECONDS = 90;

/** A run's failure that it reports: a step that ends the run. */
type StepError = GridError | ChordsError | DraftError | SaveError;

/** Where each bar of the song starts on the grid, and where the last one ends. */
function barStartsOf(grid: BarGrid, duration: number): number[] {
	const barStarts: number[] = [];
	for (let bar = 1; bar < 2000; bar++) {
		const t = secondsAtBar(grid, bar);
		if (t > duration) break;
		barStarts.push(t);
	}
	barStarts.push(Math.min(duration, secondsAtBar(grid, barStarts.length + 1)));
	return barStarts;
}

/** A grid of one tempo, without a ramp, in one meter: the only kind the chartless placement reads (one bar length, one lattice). */
const steadyGrid = (grid: BarGrid) =>
	grid.tempos.length === 1 && !grid.tempos[0]!.ramp && grid.meters.length === 1;

/**
 * "Detect chords" and "Draft chart with AI" (SongTempoKeyTab.svelte, the Docs
 * panel's ⋯ menu): one chord per bar on the song's grid (on a steady grid,
 * its bars placed on the stems' own beat when the placement decides,
 * audio/chartlessGrid.ts), from the chord
 * model's read of the mix on the server when the song has a mix (waited for
 * while it runs), otherwise from Basic Pitch on the tonal stems, checked by
 * the AI (never the model's chords: stem-bench Study 17 G4); then the AI turns them into sections, a
 * progression per section and a chart, each saved on request by the page's
 * draft card. Each run is an Effect fiber: Cancel, or a new run, interrupts
 * it, so nothing after its current step happens (docs/song-page.md "Effect
 * on the client, as a pilot").
 */
export class SongChordDraft {
	/** What a run is doing ("Listening… 40%"), or null when none is. */
	chordBusy = $state<string | null>(null);
	chordSegments = $state<ChordSegment[] | null>(null);
	/** Which path produced `chordSegments`: the chord model on the mix, or the notes. */
	chordSource = $state<"model" | "notes" | null>(null);
	chordBars = $state<{ bar: number; notes: string }[]>([]);
	/** How many bars the AI corrected from the notes; null when it did not check them. */
	chordsChecked = $state<{ changed: number } | null>(null);
	chordError = $state<string | null>(null);
	draft = $state<ChartDraft | null>(null);
	draftBusy = $state(false);
	/** A score's part is being charted (`chartPart`); the card's part buttons are disabled meanwhile. */
	partBusy = $state(false);
	/**
	 * The bars placed on the stems' own beat (audio/chartlessGrid.ts) for this
	 * run's chords and draft; null when the declared grid stands (a changing
	 * tempo or meter, an undecided vote, or the placement failed).
	 */
	placement = $state<ChartlessGrid | null>(null);
	/** "Generate chart"'s step while it runs (`progress` reads it). */
	#step = $state<string | null>(null);
	/** Where each bar the chords were read on starts, and where the last ends: the draft's grid. */
	#barStarts: number[] = [];
	/** The latest run; a new run interrupts it before starting, Cancel interrupts it. */
	#fiber: Fiber.Fiber<void> | null = null;
	#opts: SongChordDraftOptions;

	constructor(opts: SongChordDraftOptions) {
		this.#opts = opts;
	}

	/**
	 * Starts a run once the previous one has stopped (its cleanup has run), and
	 * resolves when this one ends: done, failed and reported, or interrupted.
	 */
	#run(program: Effect.Effect<void>): Promise<void> {
		const previous = this.#fiber;
		const fiber = Effect.runFork(
			previous ? Effect.andThen(Fiber.interrupt(previous), program) : program,
		);
		this.#fiber = fiber;
		return Effect.runPromise(Fiber.await(fiber)).then(() => undefined);
	}

	/**
	 * What "Generate chart" is doing, null when it is not running: the
	 * detection's own progress while it detects, then its step.
	 */
	get progress(): string | null {
		if (!this.#step) return null;
		if (this.chordBusy) return this.chordBusy;
		return this.draftBusy ? "Drafting the chart with AI…" : this.#step;
	}

	cancelDraft = () => {
		if (this.#fiber) Effect.runFork(Fiber.interrupt(this.#fiber));
		this.chordBusy = null;
		this.draftBusy = false;
		this.#step = null;
		notify("Canceled", { kind: "info" });
	};

	/** The chord card's Dismiss: the chords and any draft from them go. */
	dismiss = () => {
		this.chordSegments = null;
		this.chordSource = null;
		this.draft = null;
		this.placement = null;
	};

	/** A score's chart (the Docs panel's `onchart`) shown in the draft card, in place of any draft. */
	fromScore = (score: ScoreChart) => {
		this.chordError = null;
		this.draft = chartDraftOfScore(score, score.source);
	};

	/** The card's part button for a score without chord symbols: that part's notes charted, in place of the draft. */
	chartPart = async (part: string) => {
		const { notationId, scoreName = "" } = this.draft ?? {};
		if (!notationId || this.partBusy) return;
		this.partBusy = true;
		try {
			const r = await chartFromScore({ id: notationId, part });
			this.draft = chartDraftOfScore({ ...r, notationId }, scoreName);
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		} finally {
			this.partBusy = false;
		}
	};

	detectChords = () => this.#run(this.#detect());

	/** The chart panel's button: detect chords first when that has not run, then draft. */
	draftFromPanel = () =>
		this.#run(
			Effect.gen({ self: this }, function* () {
				if (!this.chordSegments) yield* this.#detect();
				if (this.chordSegments) yield* this.#draft();
			}),
		);

	draftFromChords = () => this.#run(this.#draft());

	/**
	 * "Generate chart from the stems" (the empty chart panel): a tempo and a
	 * time signature when the song has none, the chords, the placement's bar
	 * one as the song's start of bar 1, the AI's draft, then its sections
	 * (unless the song has some) and its chart saved. One run, so Cancel stops
	 * it at its current step; each step that fails has reported itself.
	 */
	generateChart = () =>
		this.#run(
			Effect.gen({ self: this }, function* () {
				yield* this.#ensureGrid();
				if (!this.#ready())
					return yield* new GridError({ cause: "Every stem has to decode first" });
				this.#step = "Detecting the chords…";
				yield* this.#detect();
				if (!this.chordSegments) return;
				const placed = yield* this.#useBarOne();
				this.#step = "Drafting the chart with AI…";
				yield* this.#draft();
				if (this.draft) yield* this.#saveGenerated(this.draft, placed);
			}).pipe(Effect.catch(this.#fail), Effect.ensuring(Effect.sync(() => (this.#step = null)))),
		);

	/** The song's grid, set from the stems when it has none; a `GridError` when it still has none. */
	#ensureGrid(): Effect.Effect<void, GridError> {
		return Effect.gen({ self: this }, function* () {
			if (this.#opts.grid()) return;
			this.#step = "Setting the tempo and time signature from the stems…";
			const ok = yield* attempt(() => this.#opts.ensureGrid()).pipe(
				Effect.orElseSucceed(() => false),
			);
			if (!ok) yield* new GridError({ cause: "Set a tempo and a time signature first" });
		});
	}

	/**
	 * A decided placement's bar one and tempo saved as the song's ("Use as
	 * start of bar 1"); null when there is none or the save failed (said, and
	 * the run goes on: the chart carries its own timing map).
	 */
	#useBarOne(): Effect.Effect<{ startAt: number; bpm: number } | null> {
		return Effect.gen({ self: this }, function* () {
			const placement = this.placement;
			if (!placement?.decided || placement.byStart) return null;
			this.#step = "Setting the start of bar 1…";
			const use = chartlessGridUse(placement);
			return yield* attempt(async () => {
				await useChartlessGrid({ id: this.#opts.songId(), ...use });
				await this.#opts.onsaved();
				return use;
			}).pipe(
				Effect.mapError((cause) => new BarOneError({ cause })),
				Effect.catchTag("BarOneError", (e) =>
					Effect.sync(() => {
						notify(errorMessage(e.cause), { kind: "info" });
						return null;
					}),
				),
			);
		});
	}

	/** The generated draft's sections (unless the song has some) and its chart saved; the draft goes and the page refreshes. */
	#saveGenerated(
		draft: ChartDraft,
		placed: { startAt: number; bpm: number } | null,
	): Effect.Effect<void, SaveError> {
		return Effect.gen({ self: this }, function* () {
			this.#step = "Saving…";
			const id = this.#opts.songId();
			const bars = this.#barStarts.length - 1;
			// Each section at its placed bar's start; a bar off the grid is left out.
			const sections = draft.sections.flatMap((s) => {
				const bar = Math.round(s.bar);
				return bar >= 1 && bar <= bars ? [{ name: s.name, start: this.#barStarts[bar - 1]! }] : [];
			});
			if (sections.length > 0 && !this.#opts.hasSections())
				yield* attempt(() => saveSections({ id, sections })).pipe(
					Effect.catch((e) => Effect.sync(() => notify(errorMessage(e), { kind: "error" }))),
				);
			yield* attempt(() =>
				saveChartDraft({
					id,
					markdown: draft.chart,
					// The run starts only on an empty chart.
					replace: false,
					...(draft.timing
						? { timing: draft.timing, confidence: draft.confidence ?? undefined }
						: {}),
				}),
			).pipe(Effect.mapError((cause) => new SaveError({ cause })));
			this.draft = null;
			yield* attempt(() => this.#opts.onsaved()).pipe(Effect.ignore);
			notify(
				generatedChartLine({
					bars: draft.timing?.chart.bars ?? bars,
					sections: draft.sections.length,
					placed,
				}),
			);
		});
	}

	/** The one place a run reports the step that ended it: the card's error and the notification. */
	#fail = (e: StepError) =>
		Effect.sync(() => {
			this.chordError = errorMessage(e.cause);
			notify(chordDraftErrorMessage(e), { kind: "error" });
		});

	#detect(): Effect.Effect<void> {
		return Effect.gen({ self: this }, function* () {
			const ready = this.#ready();
			if (!ready) return;
			const { engine, grid } = ready;
			this.chordBusy = "Listening…";
			this.chordError = null;
			this.chordSegments = null;
			this.chordSource = null;
			this.chordsChecked = null;
			this.draft = null;
			this.placement = null;
			yield* this.#read(engine, grid).pipe(
				Effect.catch(this.#fail),
				Effect.ensuring(Effect.sync(() => (this.chordBusy = null))),
			);
		});
	}

	/** The chords on the bars: the model's when it has read the mix, else from the notes, checked by the AI. */
	#read(engine: StemEngine, grid: BarGrid): Effect.Effect<void, ChordsError> {
		return Effect.gen({ self: this }, function* () {
			// The model's chords first: they feed the placement's chord-change witness.
			const chords = yield* this.#modelChords();
			const barStarts = yield* this.#placeBars(engine, grid, chords);
			this.#barStarts = barStarts;
			if (chords) return yield* this.#readModelBars(chords, barStarts);
			this.chordBusy = "Listening…";
			this.#readBars(yield* this.#notes(engine), barStarts);
			yield* this.#checkChords();
		});
	}

	/**
	 * The bar starts the chords are read on: the stems' own beat when the
	 * grid is steady and the placement decides (`placement` keeps it), else
	 * the declared grid's. Never fails: a placement that cannot run is the
	 * declared grid.
	 */
	#placeBars(
		engine: StemEngine,
		grid: BarGrid,
		runs: ChordminiRuns | null,
	): Effect.Effect<number[]> {
		return Effect.gen({ self: this }, function* () {
			const declared = barStartsOf(grid, engine.duration);
			if (!steadyGrid(grid)) return declared;
			this.chordBusy = "Placing the bars on the stems…";
			const placement = yield* attempt((signal) => this.#place(engine, grid, runs, signal)).pipe(
				Effect.mapError((cause) => new PlacementError({ cause })),
				Effect.catchTag("PlacementError", () => Effect.succeed(null)),
			);
			this.placement = placement;
			if (import.meta.env.DEV)
				(window as unknown as { __chartlessGrid?: unknown }).__chartlessGrid = placement;
			return placement?.barStarts ?? declared;
		});
	}

	/** The chartless grid on the decoded stems (audio/chartlessGridInBrowser.ts); null without buffers. */
	async #place(
		engine: StemEngine,
		grid: BarGrid,
		runs: ChordminiRuns | null,
		signal: AbortSignal,
	): Promise<ChartlessGrid | null> {
		const buffers = await engine.decodedBuffers();
		if (buffers.length === 0) return null;
		return chartlessGridInBrowser({
			buffers,
			cacheKey: alignmentFeaturesKey(engine.sourceUrls(), buffers[0]!.sampleRate),
			declaredBarSeconds: barSecondsAt(grid, grid.startAt),
			beatsPerBar: beatsPerBarAt(grid, grid.startAt),
			startAt: this.#opts.startAt(),
			runs,
			duration: engine.duration,
			signal,
		});
	}

	/** The song's chord-model state on the server, or null when the query fails (signed out, say). */
	#storedChords(id: string) {
		return attempt(() => {
			// A query is cached while its proxy lives: refresh, so each poll asks the server again.
			const query = songChords({ id });
			return query.refresh().then(() => query);
		}).pipe(Effect.orElseSucceed(() => null));
	}

	/**
	 * The chord model's frames for the song's current mix: at once when stored;
	 * when the song has a mix the model has not read yet, polled every few
	 * seconds (each wait a sleep, so Cancel interrupts it) until they arrive or
	 * the wait runs out; null without a mix, after the wait, or when the
	 * query fails, so the notes path runs instead.
	 */
	#modelChords(): Effect.Effect<ChordminiRuns | null> {
		return Effect.gen({ self: this }, function* () {
			const id = this.#opts.songId();
			const first = yield* this.#storedChords(id);
			if (first?.chords) return first.chords;
			if (!first?.hasMix) return null;
			this.chordBusy = "Reading the chords from the mix on the server…";
			return yield* this.#awaitModelChords(id);
		});
	}

	/**
	 * Polls for the model's frames until they arrive, the wait runs out, or,
	 * once a posted job should have claimed the song, none has (it failed, or
	 * AI is off for the song): null then, so the notes path runs.
	 */
	#awaitModelChords(id: string): Effect.Effect<ChordminiRuns | null> {
		const spaced = `${MODEL_POLL_SECONDS} seconds` as const;
		// The first poll a poll's interval after the read before the wait, then one every interval up to the wait's end.
		return Effect.sleep(spaced).pipe(
			Effect.andThen(
				this.#pollModelChords(id).pipe(
					Effect.retry({
						schedule: Schedule.spaced(spaced),
						times: MODEL_WAIT_SECONDS / MODEL_POLL_SECONDS - 1,
						while: (e) => e.inFlight || !e.claimWindowPassed,
					}),
					// A backstop for a poll that hangs: the polls themselves end at the wait's end.
					Effect.timeout(`${MODEL_WAIT_SECONDS} seconds`),
				),
			),
			// The last poll still not ready, or the timeout: the notes path runs.
			Effect.orElseSucceed(() => null),
		);
	}

	/**
	 * One poll of the wait: the model's frames, or `ModelNotReady`. The claim
	 * window is counted in polls (exact under fake timers), the first at no
	 * time waited; a poll the server did not answer counts as a run in flight.
	 */
	#pollModelChords(id: string): Effect.Effect<ChordminiRuns, ModelNotReady> {
		let polls = 0;
		return Effect.suspend(() => this.#storedChords(id)).pipe(
			Effect.flatMap((stored) => {
				const waited = MODEL_POLL_SECONDS * polls++;
				if (stored?.chords) return Effect.succeed(stored.chords);
				return Effect.fail(
					new ModelNotReady({
						inFlight: stored?.inFlight ?? true,
						claimWindowPassed: waited >= MODEL_CLAIM_SECONDS,
					}),
				);
			}),
		);
	}

	/**
	 * A chord per bar from the model's frames, never checked by the AI (stem-bench
	 * Study 17 G4: the reconciler broke right bars). Each bar's notes ride along
	 * for the draft when the server's transcription is complete; the browser
	 * never transcribes for this.
	 */
	#readModelBars(chords: ChordminiRuns, barStarts: number[]): Effect.Effect<void> {
		return Effect.gen({ self: this }, function* () {
			const notes = yield* attempt(() => songNotes({ id: this.#opts.songId() })).pipe(
				Effect.orElseSucceed(() => null),
			);
			this.chordBars = notes?.complete ? describeBars(notes.notes, barStarts) : [];
			this.chordSegments = chordminiBarChords(chords, barStarts);
			this.chordSource = "model";
			this.chordsChecked = null;
			if (this.chordSegments.length === 0)
				this.chordError = "No bars to read; check the tempo and time signature.";
		});
	}

	/** The engine and the grid when every stem has decoded and the song has a tempo and a meter. */
	#ready(): { engine: StemEngine; grid: BarGrid } | null {
		const grid = this.#opts.grid();
		const engine = this.#opts.engine();
		return engine && engine.status === "ready" && grid ? { engine, grid } : null;
	}

	/** A chord per bar from the notes, and each bar's notes for the AI. */
	#readBars(notes: Note[], barStarts: number[]) {
		if (import.meta.env.DEV)
			(window as unknown as { __stemNotes?: unknown }).__stemNotes = { notes, barStarts };
		this.chordSegments = chordsPerBar(notes, barStarts);
		this.chordSource = "notes";
		this.chordBars = describeBars(notes, barStarts);
		if (this.chordSegments.length === 0)
			this.chordError = "No bars to read; check the tempo and time signature.";
	}

	/**
	 * The song's notes: the server's when its transcription covers the song,
	 * otherwise transcribed here (the server copy keeps growing in the
	 * background).
	 */
	#notes(engine: StemEngine): Effect.Effect<Note[], ChordsError> {
		return Effect.gen({ self: this }, function* () {
			const stored = yield* attempt(() => songNotes({ id: this.#opts.songId() })).pipe(
				Effect.orElseSucceed(() => null),
			);
			if (stored?.complete) return stored.notes;
			this.chordBusy =
				stored && stored.doneSeconds > 0
					? `Listening… (server ${Math.round((100 * stored.doneSeconds) / Math.max(1, stored.duration))}% done)`
					: "Listening…";
			return yield* attempt((signal) => this.#transcribe(engine, signal)).pipe(
				Effect.mapError((cause) => new ChordsError({ cause })),
			);
		});
	}

	/**
	 * Basic Pitch in the browser. It takes no signal, so an interrupted run
	 * stops it at its next progress report.
	 */
	async #transcribe(engine: StemEngine, signal: AbortSignal): Promise<Note[]> {
		const { transcribeNotes } = await import("#lib/audio/transcribe.js");
		const buffers = await engine.decodedBuffers();
		const features = buffers.map((b) => extractFeatures(b, 30));
		const top = Math.max(...features.map((f) => f.tonal), 1e-9);
		return transcribeNotes(
			buffers.map((buffer, i) => ({ buffer, weight: features[i].tonal / top })),
			engine.duration,
			(p) => {
				signal.throwIfAborted();
				this.chordBusy = `Listening… ${Math.round(p * 100)}%`;
			},
		);
	}

	/**
	 * The detected chords checked against their notes by the AI (stem-bench
	 * Study 13: the matcher reads about 38 % of bars right on a real
	 * recording, 54 % after this pass). Any failure keeps the detector's
	 * chords, without a word: they are still shown.
	 */
	#checkChords(): Effect.Effect<void> {
		return Effect.gen({ self: this }, function* () {
			const segments = this.chordSegments;
			if (!this.#opts.aiAvailable() || !segments?.length) return;
			this.chordBusy = "Checking the chords with AI…";
			const answer = yield* attempt(() =>
				reconcileChords({
					id: this.#opts.songId(),
					chords: segments.map((c) => ({ bar: c.bar, bars: c.bars, chord: c.chord })),
					bars: this.chordBars,
				}),
			).pipe(Effect.orElseSucceed(() => null));
			if (!answer?.chords) return;
			const fixed = reconciledSegments(segments, answer.chords);
			this.chordSegments = fixed.segments;
			this.chordsChecked = { changed: fixed.changed };
		});
	}

	#draft(): Effect.Effect<void> {
		return Effect.gen({ self: this }, function* () {
			const segments = this.chordSegments;
			if (!segments) return;
			this.draftBusy = true;
			this.chordError = null;
			yield* attempt(() =>
				draftChart({
					id: this.#opts.songId(),
					chords: segments.map((c) => ({ bar: c.bar, bars: c.bars, chord: c.chord })),
					bars: this.chordBars,
					source: this.chordSource === "model" ? "model" : "matcher",
					grid: this.#barStarts,
				}),
			).pipe(
				Effect.map((answer) => (this.draft = answer)),
				Effect.mapError((cause) => new DraftError({ cause })),
				Effect.catch(this.#fail),
				Effect.ensuring(Effect.sync(() => (this.draftBusy = false))),
			);
		});
	}
}
