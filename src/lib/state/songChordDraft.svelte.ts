import { extractFeatures } from "#lib/audio/analysis.js";
import { chordsPerBar, describeBars, type ChordSegment, type Note } from "#lib/audio/chords.js";
import type { StemEngine } from "#lib/audio/engine.svelte.js";
import { secondsAtBar, type BarGrid } from "#lib/audio/measures.js";
import { draftChart, reconcileChords, songNotes } from "#lib/remote/songs.remote.js";
import { notify } from "#lib/state/notifications.svelte.js";
import { errorMessage } from "#lib/utils/errorMessage.js";
import { reconciledSegments } from "#lib/utils/reconciledSegments.js";
import type { ChartDraftAnswer } from "#lib/val/ChartDraftSchema.js";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";

/** What the page supplies: functions, since each follows the page's data and the player. */
export interface SongChordDraftOptions {
	songId: () => string;
	/** The Stem Player's engine, once it has mounted. */
	engine: () => StemEngine | null;
	/** The song's bar grid (null without a tempo and a time signature). */
	grid: () => BarGrid | null;
	/** Whether the AI is at hand for this song. */
	aiAvailable: () => boolean;
}

/**
 * A promise as an Effect, its rejection kept as the error. A thunk that takes
 * the signal sees it aborted when the run is interrupted (Effect passes it
 * only to a thunk that declares the parameter).
 */
const attempt = <A>(thunk: (signal: AbortSignal) => PromiseLike<A>) =>
	Effect.tryPromise({ try: thunk, catch: (e) => e });

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

/**
 * "Detect chords" and "Draft chart with AI" (SongTempoKeyTab.svelte, the Docs
 * panel's ⋯ menu): Basic Pitch on the tonal stems, one chord per bar on the
 * song's grid, checked by the AI; then the AI turns them into sections, a
 * progression per section and a chart, each saved on request by the page's
 * draft card. Each run is an Effect fiber: Cancel, or a new run, interrupts
 * it, so nothing after its current step happens (docs/song-page.md "Effect
 * on the client, as a pilot").
 */
export class SongChordDraft {
	/** What a run is doing ("Listening… 40%"), or null when none is. */
	chordBusy = $state<string | null>(null);
	chordSegments = $state<ChordSegment[] | null>(null);
	chordBars = $state<{ bar: number; notes: string }[]>([]);
	/** How many bars the AI corrected from the notes; null when it did not check them. */
	chordsChecked = $state<{ changed: number } | null>(null);
	chordError = $state<string | null>(null);
	draft = $state<(ChartDraftAnswer & { chartHtml: string }) | null>(null);
	draftBusy = $state(false);
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

	cancelDraft = () => {
		if (this.#fiber) Effect.runFork(Fiber.interrupt(this.#fiber));
		this.chordBusy = null;
		this.draftBusy = false;
		notify("Canceled", { kind: "info" });
	};

	/** The chord card's Dismiss: the chords and any draft from them go. */
	dismiss = () => {
		this.chordSegments = null;
		this.draft = null;
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

	#fail(what: string, e: unknown) {
		this.chordError = errorMessage(e);
		notify(`${what}: ${this.chordError}`, { kind: "error" });
	}

	#detect(): Effect.Effect<void> {
		return Effect.gen({ self: this }, function* () {
			const ready = this.#ready();
			if (!ready) return;
			const { engine, grid } = ready;
			this.chordBusy = "Listening…";
			this.chordError = null;
			this.chordSegments = null;
			this.chordsChecked = null;
			this.draft = null;
			const duration = engine.duration;
			yield* this.#notes(engine).pipe(
				Effect.map((notes) => this.#readBars(notes, barStartsOf(grid, duration))),
				Effect.andThen(this.#checkChords()),
				Effect.catch((e) => Effect.sync(() => this.#fail("Chord detection failed", e))),
				Effect.ensuring(Effect.sync(() => (this.chordBusy = null))),
			);
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
		this.chordBars = describeBars(notes, barStarts);
		if (this.chordSegments.length === 0)
			this.chordError = "No bars to read; check the tempo and time signature.";
	}

	/**
	 * The song's notes: the server's when its transcription covers the song,
	 * otherwise transcribed here (the server copy keeps growing in the
	 * background).
	 */
	#notes(engine: StemEngine): Effect.Effect<Note[], unknown> {
		return Effect.gen({ self: this }, function* () {
			const stored = yield* attempt(() => songNotes({ id: this.#opts.songId() })).pipe(
				Effect.orElseSucceed(() => null),
			);
			if (stored?.complete) return stored.notes;
			this.chordBusy =
				stored && stored.doneSeconds > 0
					? `Listening… (server ${Math.round((100 * stored.doneSeconds) / Math.max(1, stored.duration))}% done)`
					: "Listening…";
			return yield* attempt((signal) => this.#transcribe(engine, signal));
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
				}),
			).pipe(
				Effect.map((answer) => (this.draft = answer)),
				Effect.catch((e) => Effect.sync(() => this.#fail("The draft failed", e))),
				Effect.ensuring(Effect.sync(() => (this.draftBusy = false))),
			);
		});
	}
}
