import { alignChartInBrowser } from "#lib/audio/alignChartInBrowser.js";
import {
	analyse,
	combineFeatures,
	combineKeySegments,
	detectKeys,
	extractFeatures,
	extractKeySegments,
	type Detection,
	type KeyChange,
} from "#lib/audio/analysis.js";
import type { StemEngine } from "#lib/audio/engine.svelte.js";
import { barGrid, barSecondsAt, snapToAnchor, snapToDownbeat } from "#lib/audio/measures.js";
import {
	SONG_CHANGE_KINDS,
	SONG_CHANGE_LABELS,
	type SongChangeKind,
} from "#lib/constants/songChanges.js";
import { askAiAboutSong, chartBarsOf, saveChanges } from "#lib/remote/songs.remote.js";
import type { AiAnswer } from "#lib/server/aiDetect.js";
import { notify } from "#lib/state/notifications.svelte.js";
import type { SongChanges } from "#lib/state/songChanges.svelte.js";
import { alignedPlacements } from "#lib/utils/alignedPlacements.js";
import { errorMessage } from "#lib/utils/errorMessage.js";
import { formatSongChange } from "#lib/utils/formatSongChange.js";
import { keyLine } from "#lib/utils/keyLine.js";
import { keyWindows } from "#lib/utils/keyWindows.js";
import { placeAnswerByAlignment, type PlacedAnswer } from "#lib/utils/placeAnswerByAlignment.js";
import type { AlignedChart } from "#lib/utils/placedSections.js";
import { scanOffer, type ScanLadder, type ScanOffer } from "#lib/utils/scanOffer.js";
import { tempoAlternatesText, tempoRungText } from "#lib/utils/tempoRungText.js";
import type { SongChange } from "#lib/val/SongChangeSchema.js";
import * as Effect from "effect/Effect";
import * as Schedule from "effect/Schedule";

/** What the song check reads of the song (the page's data). */
export interface CheckedSong {
	id: string;
	changes: SongChange[];
	sections: { start: number }[];
	startAt: number | null;
}

/** What the page supplies: functions for whatever follows its data and the player. */
export interface SongCheckOptions {
	song: () => CheckedSong;
	/** The Stem Player's engine, once it has mounted. */
	engine: () => StemEngine | null;
	/** Whether the AI is at hand for this song. */
	aiAvailable: () => boolean;
	/** The song has a chart the AI can read with the mix (a score, or its chord chart). */
	hasScore: () => boolean;
	/** The tempo, key and time signature rows a scan or an answer writes. */
	changes: SongChanges;
	/** After a save: the page's data again (refreshAll). */
	onsaved: () => Promise<void>;
	/** Show the settings' Tempo & key tab, where an answer that came unasked is offered. */
	showTab: () => void;
}

/** A scan's result for the card: what is offered (or was applied), described. */
interface ScanResult {
	detection: Detection;
	/** The keys through the song, a change each (one for a song that stays put). */
	keys: KeyChange[];
	/** The rows a Replace writes: all of them, or only those that differ when the tempo sits on the declared one's ladder. */
	values: SongChange[];
	/** The declared tempo matched on its ladder (docs/tempo-grid-plan.md), with the declared bpm; null when it did not or there is none. */
	ladder: ScanLadder | null;
	summary: string;
	/** The detection's other rungs ("or 224 counted in eighths"), when the tempo is among the values. */
	alternates: string;
	current: string;
	applied: boolean;
}

/** After an upload the mix renders in the background; the check waits for it this long. */
const MIX_WAIT_TRIES = 18;
const MIX_WAIT_MS = 10_000;

/** A promise as an Effect, its rejection kept as the error (not wrapped in Cause.UnknownError). */
const attempt = <A>(thunk: () => PromiseLike<A>) =>
	Effect.tryPromise({ try: thunk, catch: (e) => e });

/** 409: the mix is not rendered yet (renditions still transcoding after an upload). */
const mixPending = (e: unknown) => (e as { status?: unknown } | null)?.status === 409;

/** What a scan would write: tempo and time signature at 0:00, and the keys where each begins. */
function scanChanges(d: Detection, keys: KeyChange[]): SongChange[] {
	return [
		...(d.tempo.bpm
			? [{ kind: "tempo" as const, start: 0, value: String(Math.round(d.tempo.bpm)) }]
			: []),
		...keys.map((k) => ({ kind: "key" as const, start: k.start, value: k.value })),
		...(d.tempo.bpm ? [{ kind: "meter" as const, start: 0, value: d.meter.value }] : []),
	];
}
/** "counted in eighths": how the declared tempo counts the heard grid at this rung. */
const countedAs = (factor: number) => tempoRungText(0, factor).replace(/^\S+\s+/, "");
/** "112 bpm · D major · 4/4 (or 224 counted in eighths)": the summary with the tempo's other rungs. */
function withAlternates(summary: string, d: Detection): string {
	const alt = tempoAlternatesText(d.tempo);
	return alt ? `${summary} (${alt})` : summary;
}
/** The upload-time notice for a song that keeps its own settings. */
function keptNotice(summary: string, ladder: ScanLadder | null): string {
	if (!ladder) return `Detected ${summary}; the song's own settings are kept`;
	if (ladder.factor === 1) return `Detected ${summary}: it agrees with the song's settings (kept)`;
	return `Detected ${summary}: it agrees with the song's ${ladder.declared} bpm ${countedAs(ladder.factor)} (kept)`;
}
/** "Tempo, key and time signature", for the kinds among the rows. */
function kindsText(rows: SongChange[]): string {
	const names = SONG_CHANGE_KINDS.filter((k) => rows.some((r) => r.kind === k)).map((k) =>
		SONG_CHANGE_LABELS[k].toLowerCase(),
	);
	const list =
		names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? "");
	return list.charAt(0).toUpperCase() + list.slice(1);
}
/** "120 bpm · C major (also A♭ major) · 4/4", one entry per kind. */
const describe = (rows: SongChange[]) =>
	SONG_CHANGE_KINDS.map((kind) => {
		if (kind === "key") return keyLine(rows);
		const c = rows.find((r) => r.kind === kind && r.start === 0);
		return c ? formatSongChange(c) : "";
	})
		.filter((x) => x !== "")
		.join(" · ") || "nothing";
/** The scan result for the card: what is offered (or was applied), described, beside the song's current rows. */
function scanResultOf(
	detection: Detection,
	keys: KeyChange[],
	offer: ScanOffer,
	applied: boolean,
	current: SongChange[],
): ScanResult {
	const kinds = new Set(offer.values.map((r) => r.kind));
	return {
		detection,
		keys,
		values: offer.values,
		ladder: offer.ladder,
		summary: describe(offer.values),
		alternates: kinds.has("tempo") ? tempoAlternatesText(detection.tempo) : "",
		current: applied ? "" : describe(current.filter((c) => kinds.has(c.kind))),
		applied,
	};
}

/** An answer's rows at 0:00: what the chart states (no row where it has no tempo mark or time signature, or marks no meter). */
function answerAt0(answer: AiAnswer): { kind: SongChangeKind; value: string }[] {
	return [
		...(answer.tempo === null
			? []
			: [{ kind: "tempo" as const, value: String(Math.round(answer.tempo)) }]),
		...(answer.key ? [{ kind: "key" as const, value: answer.key }] : []),
		...(answer.meter === null || answer.meter === "free"
			? []
			: [{ kind: "meter" as const, value: answer.meter }]),
	];
}

/**
 * The song settings' Tempo & key checks (SongTempoKeyTab.svelte): "Scan
 * stems" (the upload-time detector again on the player's buffers, or the AI
 * reading the chart when the song has one), "Ask AI to check" (the model
 * reads the song's score beside the rendered mix and places its keys, time
 * signature and tempo marks, src/lib/server/aiDetect.ts; docs/audio-engine.md
 * "The song-check reads the chart"), the uploader's detection, and the chart
 * aligned to the stems. Answers go into the SongChanges rows and are saved.
 */
export class SongCheck {
	scanning = $state(false);
	scanResult = $state<ScanResult | null>(null);
	aiBusy = $state(false);
	aiAnswer = $state<PlacedAnswer | null>(null);
	aiError = $state<string | null>(null);
	/** The answer came unasked: Scan stems or an upload on a song with a chart. */
	#aiAuto = false;
	#opts: SongCheckOptions;

	constructor(opts: SongCheckOptions) {
		this.#opts = opts;
	}

	/** "The stems agree with your 224 bpm (heard as 112, counted in eighths)." */
	agreementText(ladder: ScanLadder, d: Detection): string {
		if (ladder.factor === 1) return `The stems agree with your ${ladder.declared} bpm.`;
		return `The stems agree with your ${ladder.declared} bpm (heard as ${Math.round(d.tempo.bpm)}, ${countedAs(ladder.factor)}).`;
	}

	/** An answer as one line: "96 bpm · C major (also A♭ major, F major) · 4/4"; tempo and meter only where the chart states them. */
	aiLine(a: AiAnswer): string {
		const keys = [a.key, ...a.keyChanges.map((c) => c.key)].filter(
			(k, i, all) => k && all.indexOf(k) === i,
		);
		const key = keys.length > 1 ? `${keys[0]} (also ${keys.slice(1).join(", ")})` : (keys[0] ?? "");
		return [
			a.tempo === null ? null : `${Math.round(a.tempo)} bpm`,
			key,
			a.meter === "free" ? "no meter" : a.meter,
		]
			.filter(Boolean)
			.join(" · ");
	}

	/**
	 * The chart aligned to the decoded stems in a worker (stem-bench Study 12;
	 * no AI): its placements and the chart parser's warnings, or why it could
	 * not be aligned. A failure in the worker rejects; the callers handle it.
	 */
	alignChart = async (): Promise<AlignedChart> => {
		const chart = await chartBarsOf({ id: this.#opts.song().id });
		if (chart.bars === null) return { reason: chart.reason };
		const engine = this.#opts.engine();
		if (engine?.status !== "ready") return { reason: "audio" };
		const alignment = await alignChartInBrowser(chart.bars, await engine.decodedBuffers());
		return { placements: alignedPlacements(chart.bars, alignment), warnings: chart.warnings };
	};

	/**
	 * Where the keys are read: at the song's sections when it has two or more
	 * (a key change lands on a section line as a rule), else every half
	 * minute, which finds a change in a song without sections at the cost of
	 * a coarser start.
	 */
	#keyBoundaries(): number[] {
		const song = this.#opts.song();
		const sections = song.sections.map((s) => s.start).filter((t) => t > 0);
		if (sections.length >= 1 && song.sections.length >= 2) return [0, ...sections];
		return keyWindows(this.#opts.engine()?.duration ?? 0);
	}

	/** "Scan stems": fills empty settings straight away; offers to replace filled ones. */
	scanStems = async () => {
		const engine = this.#opts.engine();
		if (!engine || engine.status !== "ready") return;
		// With a chart and the AI at hand, the AI reads the chart and listens; the stems only when it cannot.
		if (await this.#chartFirst()) return;
		this.scanning = true;
		this.scanResult = null;
		try {
			await this.#scan(engine);
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		} finally {
			this.scanning = false;
		}
	};

	/** On a song with a chart and the AI at hand: whether the AI answered in the stems' place. */
	async #chartFirst(): Promise<boolean> {
		if (!this.#opts.hasScore() || !this.#opts.aiAvailable() || this.aiBusy) return false;
		return this.askAiWithScore();
	}

	/** The detector on the player's buffers: set at once on a song without settings, else offered. */
	async #scan(engine: StemEngine) {
		// Yield first so the button repaints; the analysis blocks the thread for a moment.
		await new Promise((r) => setTimeout(r, 30));
		const buffers = await engine.decodedBuffers();
		const combined = combineFeatures(buffers.map((b) => extractFeatures(b)));
		if (!combined) return;
		const detection = analyse(combined);
		// The key per section (or half minute), so a song that moves through keys gets each where it begins (docs/audio-engine.md, "Several keys").
		const boundaries = this.#keyBoundaries();
		const keys = detectKeys(
			combineKeySegments(buffers.map((b) => extractKeySegments(b, boundaries))),
		);
		const values = scanChanges(detection, keys);
		if (values.length === 0) {
			notify("Nothing could be detected from these stems", { kind: "info" });
			return;
		}
		// On the declared tempo's ladder the tempo agrees: offer only what differs (docs/tempo-grid-plan.md). Read before a first fill saves the rows.
		const current = this.#opts.song().changes;
		const offer = scanOffer(detection, values, current);
		const fresh = current.length === 0;
		if (fresh) {
			await saveChanges({ id: this.#opts.song().id, changes: values });
			await this.#opts.onsaved();
			this.#opts.changes.reset();
			notify("Tempo, key and time signature set from the stems");
		}
		this.scanResult = scanResultOf(detection, keys, offer, fresh, this.#opts.song().changes);
	}

	replaceFromScan = async () => {
		if (!this.scanResult) return;
		const values = this.scanResult.values;
		const replaced = values.map((r) => r.kind);
		// The scan's keys cover the whole song, so every key change goes; tempo and meter only at 0:00, as before.
		const kept = this.#opts
			.song()
			.changes.filter((c) => !(replaced.includes(c.kind) && (c.kind === "key" || c.start === 0)));
		try {
			await saveChanges({ id: this.#opts.song().id, changes: [...kept, ...values] });
			await this.#opts.onsaved();
			this.#opts.changes.reset();
			notify(`${kindsText(values)} replaced from the stems`);
			this.scanResult = { ...this.scanResult, applied: true };
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		}
	};

	/**
	 * What the uploader heard in a batch of stems. A song with no tempo, key
	 * or time signature yet gets them as its first changes; one that has them
	 * only hears the detection, so nothing typed is overwritten.
	 */
	applyDetection = async (d: Detection, keys: KeyChange[] = []) => {
		// The keys through the song where it moves (every ten seconds of the batch), else the one key the whole batch gave.
		const keyChanges = keys.length
			? keys
			: d.key.value
				? [{ start: 0, value: d.key.value, confidence: d.key.confidence }]
				: [];
		const changes = scanChanges(d, keyChanges);
		if (changes.length === 0) return;
		const summary = describe(changes);
		const song = this.#opts.song();
		if (song.changes.length > 0) {
			notify(keptNotice(summary, scanOffer(d, changes, song.changes).ladder), {
				kind: "info",
			});
			return;
		}
		try {
			await saveChanges({ id: song.id, changes });
			await this.#opts.onsaved();
			this.#opts.changes.reset();
			notify(
				`Detected ${withAlternates(summary, d)} — set as the song's tempo, key and time signature. Change them in settings.`,
				{
					timeout: 12_000,
				},
			);
			void this.checkWithScore();
		} catch (e) {
			notify(`Detected ${summary}, but it could not be saved: ${errorMessage(e)}`, {
				kind: "error",
			});
		}
	};

	/**
	 * The song-check: the model's answer, its key and tempo changes then placed by aligning
	 * the chart to the stems when it can (stem-bench Study 12). The alignment never breaks the
	 * check: when it cannot run or fails, the model's placement stays. An Effect whose error
	 * is the AI call's rejection as it came (a 409 while the mix renders), so it can be retried.
	 */
	#checkSong(): Effect.Effect<PlacedAnswer, unknown> {
		return Effect.gen({ self: this }, function* () {
			const answer = yield* attempt(() => askAiAboutSong({ id: this.#opts.song().id }));
			if (!this.#opts.hasScore()) return answer;
			return yield* attempt(() => this.#placed(answer)).pipe(Effect.orElseSucceed(() => answer));
		});
	}

	/** The answer's changes placed by the chart aligned to the stems; as it came when the chart has no placements. */
	async #placed(answer: AiAnswer): Promise<PlacedAnswer> {
		const aligned = await this.alignChart();
		return "placements" in aligned ? placeAnswerByAlignment(answer, aligned.placements) : answer;
	}

	/** The song-check once, as a promise for the button handlers (it rejects with the AI call's error). */
	#checkOnce = () => Effect.runPromise(this.#checkSong());

	/** "Ask AI to check": "Use these" puts the answer into the rows and saves them. */
	askAi = async () => {
		this.#aiAuto = false;
		this.aiBusy = true;
		this.aiError = null;
		try {
			this.aiAnswer = await this.#checkOnce();
		} catch (e) {
			this.aiError = errorMessage(e);
		} finally {
			this.aiBusy = false;
		}
	};

	/**
	 * "Scan stems" on a song with a score: the AI reads the chart and listens
	 * to the mix, and the answer is set at once when the song has no settings
	 * yet, else offered under the rows. False when it could not answer (the
	 * mix not rendered yet, the gateway down), so the stems are scanned instead.
	 */
	askAiWithScore = async (): Promise<boolean> => {
		notify("This song has a chart; asking the AI to read it and listen", { kind: "info" });
		this.#aiAuto = true;
		this.aiBusy = true;
		this.aiError = null;
		try {
			const answer = await this.#checkOnce();
			this.aiAnswer = answer;
			this.#opts.showTab();
			if (answer.warnings?.length)
				// A doubtful read anchors nothing unasked (stem-bench Study 5): the card shows what looked wrong.
				notify(
					`The AI's reading of the chart looks off: ${answer.warnings[0]} Open settings to review it.`,
					{ kind: "error" },
				);
			else if (this.#opts.song().changes.length === 0) await this.useAiAnswer();
			else
				notify(`The AI read the chart: ${this.aiLine(answer)}; open settings to use its answer`, {
					kind: "info",
					timeout: 12_000,
				});
			return true;
		} catch (e) {
			const status = (e as { status?: unknown }).status;
			notify(
				status === 409
					? "The mix is still rendering; scanning the stems meanwhile"
					: `${errorMessage(e)}; scanning the stems instead`,
				{ kind: "info" },
			);
			this.#aiAuto = false;
			return false;
		} finally {
			this.aiBusy = false;
		}
	};

	/**
	 * After the detector has set an uploaded song's settings and the song has
	 * a chart: the AI reads the chart beside the mix once it is rendered, and
	 * its answer replaces the detector's (the detector's replaced nothing: the
	 * song had no settings before this upload). The old close-call check on a
	 * scoreless song is gone: blind, the model only read the detector's meter
	 * back (docs/audio-engine.md, "The song-check reads the chart").
	 */
	checkWithScore = async () => {
		if (!this.#opts.aiAvailable() || this.aiBusy || !this.#opts.hasScore()) return;
		notify("This song has a chart; asking the AI to read it and listen", { kind: "info" });
		this.#aiAuto = true;
		this.aiBusy = true;
		this.aiError = null;
		try {
			await this.#checkOnceMixed();
		} catch (e) {
			const status = (e as { status?: unknown }).status;
			if (status === 409) {
				notify("The mix is still rendering; use Ask AI to check once it is ready", {
					kind: "info",
				});
			} else this.aiError = errorMessage(e);
			this.#aiAuto = false;
		} finally {
			this.aiBusy = false;
		}
	};

	/**
	 * The song-check, waiting for the mix to render a while: an Effect retry
	 * while the error is a 409, every MIX_WAIT_MS up to MIX_WAIT_TRIES attempts
	 * in all; any other error, or the last 409, rejects as it came. Its answer
	 * then used at once.
	 */
	async #checkOnceMixed() {
		this.aiAnswer = await Effect.runPromise(
			this.#checkSong().pipe(
				Effect.retry({
					schedule: Schedule.spaced(MIX_WAIT_MS),
					times: MIX_WAIT_TRIES - 1,
					while: mixPending,
				}),
			),
		);
		this.#opts.showTab();
		this.aiBusy = false;
		await this.useAiAnswer();
	}

	/** Fill the rows from the model's answer and save at once (a bug report: filling alone looked like nothing happened). */
	useAiAnswer = async () => {
		const answer = this.aiAnswer;
		if (!answer) return;
		const changes = this.#opts.changes;
		const editPos = changes.editPos;
		const song = this.#opts.song();
		// Rows at 0:00 for what the chart states, plus a tempo row at each of its later marks; other rows stay.
		const at0 = answerAt0(answer);
		const replaced = at0.map((r) => r.kind);
		// The model places a change by ear, often a beat early (a chord on the "and" of four); snap each to the bar
		// line on the grid the answer itself makes (docs/audio-engine.md, "Snapped to the bar").
		const grid = barGrid(
			[
				...at0.map((r) => ({ ...r, start: 0 })),
				...answer.tempoChanges.map((c) => ({
					kind: "tempo" as const,
					start: c.at,
					value: String(Math.round(c.bpm)),
				})),
			],
			song.startAt,
		);
		// … and a key change within a bar of a section's start belongs to that section (they line up in practice).
		const sectionStarts = song.sections.map((s) => s.start);
		const snap = (at: number) => {
			if (!grid) return at;
			const bar = snapToDownbeat(grid, at);
			return snapToAnchor(bar, sectionStarts, barSecondsAt(grid, bar));
		};
		// Every earlier key change goes when the model names the keys through the song; the later tempo
		// rows go only when the chart spoke about tempo at all (its tempo is null otherwise, and the song's own rows stay).
		const keysToo = answer.keyChanges.length > 0;
		const tempoToo = answer.tempo !== null;
		const rows = changes.rows.filter(
			(r) =>
				!(
					(r.seconds === 0 && replaced.includes(r.kind)) ||
					(tempoToo && r.kind === "tempo" && r.seconds !== 0) ||
					(keysToo && r.kind === "key")
				),
		);
		for (const { kind, value } of at0) {
			rows.push({ time: editPos(0), shown: editPos(0), seconds: 0, kind, value });
		}
		for (const c of answer.tempoChanges) {
			const at = snap(c.at);
			rows.push({
				time: editPos(at),
				shown: editPos(at),
				seconds: at,
				kind: "tempo",
				value: String(Math.round(c.bpm)),
			});
		}
		for (const c of answer.keyChanges) {
			const at = snap(c.at);
			rows.push({
				time: editPos(at),
				shown: editPos(at),
				seconds: at,
				kind: "key",
				value: c.key,
			});
		}
		const line = this.aiLine(answer);
		const fromScore = this.#aiAuto;
		changes.rows = rows;
		await changes.save();
		if (changes.error)
			notify(`Could not apply the AI's answer: ${changes.error}`, { kind: "error" });
		else {
			this.aiAnswer = null;
			if (fromScore)
				notify(`The AI read the chart: ${line} — saved to the song's settings`, {
					timeout: 12_000,
				});
		}
	};
}
