import { extractFeatures } from "#lib/audio/analysis.js";
import { chordsPerBar, describeBars, type ChordSegment, type Note } from "#lib/audio/chords.js";
import type { StemEngine } from "#lib/audio/engine.svelte.js";
import { secondsAtBar, type BarGrid } from "#lib/audio/measures.js";
import { draftChart, reconcileChords, songNotes } from "#lib/remote/songs.remote.js";
import { notify } from "#lib/state/notifications.svelte.js";
import { errorMessage } from "#lib/utils/errorMessage.js";
import { reconciledSegments } from "#lib/utils/reconciledSegments.js";
import type { ChartDraftAnswer } from "#lib/val/ChartDraftSchema.js";

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

/** A run stopped by Cancel, from inside the transcription's progress callback. */
class DraftCancelled extends Error {}

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
 * draft card. Cancel drops whatever a run would still have set.
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
	/** Bumped by Cancel: a run whose number no longer matches drops its result. */
	#draftRun = 0;
	#opts: SongChordDraftOptions;

	constructor(opts: SongChordDraftOptions) {
		this.#opts = opts;
	}

	cancelDraft = () => {
		this.#draftRun++;
		this.chordBusy = null;
		this.draftBusy = false;
		notify("Canceled", { kind: "info" });
	};

	/** The chord card's Dismiss: the chords and any draft from them go. */
	dismiss = () => {
		this.chordSegments = null;
		this.draft = null;
	};

	detectChords = async (run = ++this.#draftRun) => {
		const ready = this.#ready();
		if (!ready) return;
		const { engine, grid } = ready;
		const cancelled = () => run !== this.#draftRun;
		this.chordBusy = "Listening…";
		this.chordError = null;
		this.chordSegments = null;
		this.chordsChecked = null;
		this.draft = null;
		try {
			const duration = engine.duration;
			const notes = await this.#notes(engine, cancelled);
			if (!notes || cancelled()) return;
			this.#readBars(notes, barStartsOf(grid, duration));
			await this.#checkChords(run);
		} catch (e) {
			if (cancelled() || e instanceof DraftCancelled) return;
			this.chordError = errorMessage(e);
			notify(`Chord detection failed: ${this.chordError}`, { kind: "error" });
		} finally {
			if (!cancelled()) this.chordBusy = null;
		}
	};

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
	 * background). Null when the run was canceled while asking.
	 */
	async #notes(engine: StemEngine, cancelled: () => boolean): Promise<Note[] | null> {
		const stored = await songNotes({ id: this.#opts.songId() }).catch(() => null);
		if (cancelled()) return null;
		if (stored?.complete) return stored.notes;
		this.chordBusy =
			stored && stored.doneSeconds > 0
				? `Listening… (server ${Math.round((100 * stored.doneSeconds) / Math.max(1, stored.duration))}% done)`
				: "Listening…";
		const { transcribeNotes } = await import("#lib/audio/transcribe.js");
		const buffers = await engine.decodedBuffers();
		const features = buffers.map((b) => extractFeatures(b, 30));
		const top = Math.max(...features.map((f) => f.tonal), 1e-9);
		return transcribeNotes(
			buffers.map((buffer, i) => ({ buffer, weight: features[i].tonal / top })),
			engine.duration,
			(p) => {
				if (cancelled()) throw new DraftCancelled();
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
	async #checkChords(run: number) {
		const segments = this.chordSegments;
		if (!this.#opts.aiAvailable() || !segments?.length) return;
		this.chordBusy = "Checking the chords with AI…";
		const answer = await reconcileChords({
			id: this.#opts.songId(),
			chords: segments.map((c) => ({ bar: c.bar, bars: c.bars, chord: c.chord })),
			bars: this.chordBars,
		}).catch(() => null);
		if (run !== this.#draftRun || !answer?.chords) return;
		const fixed = reconciledSegments(segments, answer.chords);
		this.chordSegments = fixed.segments;
		this.chordsChecked = { changed: fixed.changed };
	}

	/** The chart panel's button: detect chords first when that has not run, then draft. */
	draftFromPanel = async () => {
		const run = ++this.#draftRun;
		if (!this.chordSegments) await this.detectChords(run);
		if (this.chordSegments && run === this.#draftRun) await this.draftFromChords(run);
	};

	draftFromChords = async (run = ++this.#draftRun) => {
		const segments = this.chordSegments;
		if (!segments) return;
		const cancelled = () => run !== this.#draftRun;
		this.draftBusy = true;
		this.chordError = null;
		try {
			const answer = await draftChart({
				id: this.#opts.songId(),
				chords: segments.map((c) => ({ bar: c.bar, bars: c.bars, chord: c.chord })),
				bars: this.chordBars,
			});
			if (cancelled()) return;
			this.draft = answer;
		} catch (e) {
			if (cancelled()) return;
			this.chordError = errorMessage(e);
			notify(`The draft failed: ${this.chordError}`, { kind: "error" });
		} finally {
			if (!cancelled()) this.draftBusy = false;
		}
	};
}
