<script lang="ts">
	import { analyse, combineFeatures, extractFeatures, type Detection } from "$lib/audio/analysis";
	import {
		chordChart,
		chordsPerBar,
		describeBars,
		type ChordSegment,
		type Note,
	} from "$lib/audio/chords";
	import type { ChartDraftAnswer } from "$lib/val/ChartDraftSchema";
	import type { AiAnswer } from "$lib/server/aiDetect";
	import CommentTimeline from "$lib/components/CommentTimeline.svelte";
	import SongDocPanel from "$lib/components/SongDocPanel.svelte";
	import AiToggle from "$lib/components/AiToggle.svelte";
	import FinishedToggle from "$lib/components/FinishedToggle.svelte";
	import PrivacyToggle from "$lib/components/PrivacyToggle.svelte";
	import ShareLinks from "$lib/components/ShareLinks.svelte";
	import MidiBadge from "$lib/components/MidiBadge.svelte";
	import { createComment, deleteComment, updateComment } from "$lib/remote/comments.remote";
	import StemPlayer from "$lib/components/StemPlayer.svelte";
	import { type MidiSummary, parseMidi } from "$lib/audio/midi";
	import StemReplacer from "$lib/components/StemReplacer.svelte";
	import StemUploader, { type UploadJob } from "$lib/components/StemUploader.svelte";
	import { barGrid, formatPosition, parsePosition, secondsAtBar } from "$lib/audio/measures";
	import { type MixMode, mixQuery, saveMix, saveStemsZip } from "$lib/audio/downloads";
	import { bumpVersion } from "$lib/utils/bumpVersion";
	import { midiContentType } from "$lib/utils/midiContentType";
	import { formatDate } from "$lib/utils/formatDate";
	import { parseBarsText } from "$lib/utils/parseBarsText";
	import { readoutMode } from "$lib/audio/readout.svelte";
	import { notify } from "$lib/state/notifications.svelte";
	import { FRAME_RATES } from "$lib/constants/frameRates";
	import { formatBytes } from "$lib/utils/formatBytes";
	import { formatMonth } from "$lib/utils/formatMonth";
	import { POSITION_MODE_LABELS } from "$lib/constants/positionModes";
	import { toRoman } from "$lib/utils/toRoman";
	import type { SongSection } from "$lib/val/SongSectionSchema";
	import { type SongChange } from "$lib/val/SongChangeSchema";
	import {
		SONG_CHANGE_KINDS,
		SONG_CHANGE_LABELS,
		type SongChangeKind,
	} from "$lib/constants/songChanges";
	import { formatSongChange } from "$lib/utils/formatSongChange";
	import { songChangeValueError } from "$lib/utils/songChangeValueError";
	import type { StemEngine } from "$lib/audio/engine.svelte";
	import type { StemState } from "$lib/audio/types";

	import { DEMO_ACCEPT, DEMO_FORMAT_LIST, MAX_DEMOS_PER_SONG } from "$lib/constants/demoFormats";
	import { demoContentType } from "$lib/utils/demoContentType";
	import { clearForm } from "$lib/utils/clearForm";
	import { errorMessage } from "$lib/utils/errorMessage";
	import { slugify } from "$lib/utils/slugify";
	import { MIDI_ACCEPT, MIDI_MAX_BYTES } from "$lib/constants/midiFormats";
	import { STEM_ACCEPT, STEM_MAX_BYTES } from "$lib/constants/stemFormats";
	import {
		type DemoReservation,
		postJson,
		type Reservation,
		saveAs,
		uploadDemoFile,
		uploadMidiFile,
		uploadStemFile,
	} from "$lib/upload";
	import {
		deleteDemo,
		deleteSong,
		deleteStem,
		removeStemMidi,
		renameStem,
		askAiAboutSong,
		draftChart,
		songNotes,
		saveChartDraft,
		saveChanges,
		saveSections,
		setSongVersion,
		shareSong,
		updateSong,
		saveDefaultMix,
	} from "$lib/remote/songs.remote";
	import { invalidateAll } from "$app/navigation";
	import { tick, untrack } from "svelte";

	let { data } = $props();

	// Settings form (title, URL, description) on the updateSong remote form.
	let settingsPanel = $state<HTMLDivElement | null>(null);
	const fields = updateSong.fields;
	let title = $derived(fields.title.value() ?? data.song.title);
	let slug = $derived(fields.slug.value() ?? data.song.slug);
	let description = $derived(fields.description.value() ?? data.song.description);
	let songwriter = $derived(fields.songwriter.value() ?? data.song.songwriter);
	let writtenOn = $derived(fields.writtenOn.value() ?? data.song.writtenOn ?? "");
	// Positions read and are typed in the readout's format (time, timecode or bars);
	// the form carries them as seconds, converted on the way in and out.
	let posCtx = $derived({
		fps: data.song.frameRate,
		grid: barGrid(data.song.changes, data.song.startAt),
	});
	let mode = $derived(readoutMode(!!posCtx.grid));
	const showPos = (seconds: number) => formatPosition(mode, seconds, posCtx);
	// Editors show full precision (milliseconds, beat fractions) so a row that
	// is saved unedited keeps its exact seconds; see rowSeconds.
	const editPos = (seconds: number) => formatPosition(mode, seconds, posCtx, { precise: true });
	/** The exact stored seconds when the text was not touched, else what the text says (null = not a position). */
	const rowSeconds = (row: { time: string; shown: string; seconds: number | null }) =>
		row.seconds !== null && row.time.trim() === row.shown ? row.seconds : readPos(row.time);
	const readPos = (text: string) => parsePosition(text, posCtx);
	/** Why `text` did not parse: bars typed on a song without a tempo and meter get their own message. */
	const positionMessage = (text: string) =>
		parseBarsText(text) && !posCtx.grid
			? `"${text}" is in bars, but bars need a tempo and a time signature — add both under "Tempo, key and time signature" first, or enter the position as time (1:23.4) or timecode (01:23:15.72).`
			: `"${text}" is not a position (time 1:23.4, timecode 01:23:15.72, or bars 12|3).`;
	let startAtText = $derived(data.song.startAt === null ? "" : editPos(data.song.startAt));
	let endAtText = $derived(data.song.endAt === null ? "" : editPos(data.song.endAt));
	let startAtEntry = $state("");
	let endAtEntry = $state("");
	let startAt = $derived(startAtEntry);
	let endAt = $derived(endAtEntry);
	let frameRate = $derived(fields.frameRate.value() ?? String(data.song.frameRate));
	let version = $derived(fields.version.value() ?? data.song.version);

	// After stems change, offer a version bump; the user decides, nothing bumps itself.
	let versionOffer = $state(false);
	let versionBusy = $state(false);
	async function bump(level: "major" | "minor" | "patch") {
		versionBusy = true;
		try {
			const next = bumpVersion(data.song.version, level);
			await setSongVersion({ id: data.song.id, version: next });
			await invalidateAll();
			notify(`Version bumped to v${next}`);
		} finally {
			versionBusy = false;
			versionOffer = false;
		}
	}
	let positionError = $state<string | null>(null);
	const POSITION_PLACEHOLDER = { time: "0:00.0", timecode: "00:00:00.00", bars: "1|1" } as const;
	let settingsDirty = $derived(
		title.trim() !== data.song.title ||
			slug.trim() !== data.song.slug ||
			description.trim() !== data.song.description ||
			songwriter.trim() !== data.song.songwriter ||
			writtenOn !== (data.song.writtenOn ?? "") ||
			startAt.trim() !== startAtText ||
			endAt.trim() !== endAtText ||
			frameRate !== String(data.song.frameRate) ||
			version.trim() !== data.song.version,
	);

	// Demo recordings: uploaded from settings (no decoding, just the file),
	// played and downloaded from the "Demos" popover in the download row.
	let demoJobs = $state<{ name: string; percent: number; error?: string }[]>([]);
	let demoNotice = $state<string | null>(null);
	let demoBusy = $state(false);
	async function uploadDemos(input: HTMLInputElement) {
		const picked = Array.from(input.files ?? []);
		input.value = "";
		if (picked.length === 0) return;
		const unsupported = picked.filter((f) => !demoContentType(f.name));
		const tooBig = picked.filter((f) => f.size > STEM_MAX_BYTES);
		const room = Math.max(0, MAX_DEMOS_PER_SONG - data.song.demos.length);
		if (unsupported.length) {
			demoNotice = `Not a supported format (${DEMO_FORMAT_LIST}): ${unsupported.map((f) => f.name).join(", ")}`;
			return;
		}
		if (tooBig.length) {
			demoNotice = `Over the ${formatBytes(STEM_MAX_BYTES)} limit: ${tooBig.map((f) => f.name).join(", ")}`;
			return;
		}
		if (picked.length > room) {
			demoNotice = `Only ${room} more ${room === 1 ? "demo" : "demos"} fit on this song (${MAX_DEMOS_PER_SONG} max).`;
			return;
		}
		demoNotice = null;
		demoBusy = true;
		demoJobs = picked.map((f) => ({ name: f.name, percent: 0 }));
		for (const [i, file] of picked.entries()) {
			try {
				await uploadDemoFile(
					file,
					() =>
						postJson<DemoReservation>("/api/demos", {
							songId: data.song.id,
							filename: file.name,
							sizeBytes: file.size,
						}),
					(percent) => (demoJobs[i].percent = percent),
				);
			} catch (e) {
				demoJobs[i].error = errorMessage(e);
			}
		}
		await invalidateAll();
		demoBusy = false;
		if (demoJobs.every((j) => !j.error)) demoJobs = [];
	}

	// The demo player: one audio element, whichever demo was last pressed.
	let demoPlaying = $state<string | null>(null);
	let demoPaused = $state(true);
	let demoTrack = $derived(data.song.demos.find((d) => d.id === demoPlaying) ?? null);
	let demoAudio = $state<HTMLAudioElement | null>(null);
	async function playDemo(id: string) {
		if (demoPlaying === id) {
			demoPaused = !demoPaused;
			return;
		}
		// Swapping `src` fires a pause event that flips the bound state, so start
		// the new track explicitly once the element has it.
		demoPlaying = id;
		demoPaused = false;
		await tick();
		await demoAudio?.play().catch(() => {});
	}
	// "Written by X, first written June 2019" under the title.
	// Shown in the song-info popover: the song's fixed tempo, key and meter, and its version.
	let metaLine = $derived(
		SONG_CHANGE_KINDS.map((kind) => data.song.changes.find((c) => c.kind === kind))
			.filter((c) => c !== undefined)
			.map(formatSongChange)
			.join(" · "),
	);
	let writtenLine = $derived(
		[
			data.song.songwriter ? `Written by ${data.song.songwriter}` : "",
			data.song.writtenOn ? `first written ${formatMonth(data.song.writtenOn)}` : "",
		]
			.filter(Boolean)
			.join(", "),
	);

	let readyDemos = $derived(data.song.demos.filter((d) => d.status === "ready" && d.url));
	let slugTouched = $state(false);

	// Chart / Lyrics / Notes toggle for the read view. Starts on the first with content.
	const DOC_KINDS = ["chart", "lyrics", "notes"] as const;
	const DOC_LABELS = { chart: "Chart", lyrics: "Lyrics", notes: "Notes" } as const;
	// The documents panel also shows the comments; "comments" is a panel, not a document.
	const PANELS = [...DOC_KINDS, "comments"] as const;
	type Panel = (typeof PANELS)[number];
	const PANEL_LABELS = { ...DOC_LABELS, comments: "Comments" } as const;
	let panel = $state<Panel>("chart");
	let showing = $derived(panel === "comments" ? null : panel);

	// Comments: who may do what, the located ones for the timeline, and the
	// popover form (one popover, create or edit).
	let membership = $derived(data.memberships?.find((m) => m.accountId === data.account.id));
	let isAdmin = $derived(membership?.role === "owner" || membership?.role === "admin");
	const canEditComment = (c: { userId: string }) => data.user?.id === c.userId;
	const canDeleteComment = (c: { userId: string }) => canEditComment(c) || isAdmin;
	let locatedComments = $derived(
		data.comments
			.filter((c) => c.at !== null)
			.map((c) => ({ id: c.id, title: c.title, at: c.at ?? 0 }))
			.sort((a, b) => a.at - b.at),
	);
	let commentPanel = $state<HTMLDivElement | null>(null);
	let commentDraft = $state<{ id: string | null; title: string; body: string; at: string }>({
		id: null,
		title: "",
		body: "",
		at: "",
	});
	let commentError = $state<string | null>(null);
	function openComment(draft: Partial<typeof commentDraft> = {}) {
		commentDraft = { id: null, title: "", body: "", at: "", ...draft };
		commentError = null;
		// The form fields keep what was last typed; push the draft into them explicitly.
		const f = commentDraft.id ? updateComment.fields : createComment.fields;
		f.title.set(commentDraft.title);
		f.body.set(commentDraft.body);
		f.position.set(commentDraft.at);
		commentPanel?.showPopover();
	}
	function editComment(c: (typeof data.comments)[number]) {
		openComment({ id: c.id, title: c.title, body: c.body, at: c.at === null ? "" : editPos(c.at) });
	}

	// Ctrl / ⌘-click (or right-click) on a waveform: a small menu at the pointer.
	let stemMenuAt = $state<{ stem: StemState; seconds: number; x: number; y: number } | null>(null);
	function onStemContext(stem: StemState, seconds: number, x: number, y: number) {
		stemMenuAt = { stem, seconds, x, y };
	}
	function closeStemContext(e: Event) {
		if (stemMenuAt && !(e.target as HTMLElement).closest("[data-stem-context]")) stemMenuAt = null;
		if (chartMenuEl?.open && !chartMenuEl.contains(e.target as Node)) chartMenuEl.open = false;
	}
	let doc = $derived(showing ?? "chart");
	// In-panel editing (SongDocPanel): whether the shown document is open for editing.
	// The panel autosaves; closing goes through its close(), which flushes first.
	let docEditing = $state(false);
	let docPanel = $state<SongDocPanel | null>(null);
	/** The document panel's ⋯ menu (a <details>): closed on a choice or a click elsewhere. */
	let chartMenuEl = $state<HTMLDetailsElement | null>(null);
	/** The editor pane while editing in the panel, chosen in that menu. */
	let docView = $state<"rendered" | "markdown">("rendered");
	let docSaving = $state(false);
	const DOC_VIEWS = [
		{ id: "rendered", name: "Rich Text" },
		{ id: "markdown", name: "Markdown" },
	] as const;
	const DOC_HINTS = {
		chart:
			"Chords and arrangement. Select text for formatting; the ⋮ next to a block changes its type. Use a code block for chord grids so spacing is kept.",
		lyrics:
			"Lyrics. One line per lyric line; a blank line starts a new section, and a heading names it (Verse, Chorus).",
		notes: "Notes. Anything about the song — ideas, references, production to-dos, who plays what.",
	} as const;
	let DOC_TEXT = $derived({
		chart: data.song.chartMarkdown,
		lyrics: data.song.lyricsMarkdown,
		notes: data.song.notesMarkdown,
	});
	let DOC_VERSION = $derived({
		chart: data.song.chartVersion,
		lyrics: data.song.lyricsVersion,
		notes: data.song.notesVersion,
	});
	// Start on the first document with content.
	panel = untrack(() => DOC_KINDS.find((k) => data.docs[k]) ?? "chart");

	let pending = $derived(data.song.stems.filter((s) => s.status !== "ready"));
	let uploadJobs = $state<UploadJob[]>([]);
	let uploadNotice = $state<string | null>(null);
	let ready = $derived(data.song.stems.filter((s) => s.status === "ready" && s.url));

	// "Upload new version" for one stem: same pipeline as adding, but the
	// reservation is /api/stems/[id]/replace, which keeps the row and label.
	let replacing = $state<Record<string, { percent: number; stage: string; error?: string }>>({});
	async function replaceStem(stemId: string, input: HTMLInputElement) {
		const file = input.files?.[0];
		input.value = "";
		if (!file) return;
		const ctx = new AudioContext({ sampleRate: 32_000 });
		replacing[stemId] = { percent: 0, stage: "uploading" };
		try {
			await uploadStemFile(
				file,
				() =>
					postJson<Reservation>(`/api/stems/${stemId}/replace`, {
						filename: file.name,
						sizeBytes: file.size,
					}),
				{
					ctx,
					onProgress: (p) => (replacing[stemId] = { ...replacing[stemId], percent: p }),
					onDecoding: () => (replacing[stemId] = { ...replacing[stemId], stage: "decoding" }),
				},
			);
			delete replacing[stemId];
			await invalidateAll();
			versionOffer = true;
		} catch (err) {
			replacing[stemId] = { ...replacing[stemId], stage: "error", error: (err as Error).message };
		} finally {
			await ctx.close();
		}
	}

	// Rename from the row menu. A prompt keeps this one-click; the load refresh
	// carries the new label into the player without re-decoding (StemPlayer
	// relabels in place).
	async function rename(stemId: string, current: string) {
		const label = prompt("Stem name", current)?.trim();
		if (!label || label === current) return;
		await renameStem({ id: stemId, label });
		await invalidateAll();
	}

	// The database row behind a player stem (filename, size, url).
	let stemRows = $derived(new Map(data.song.stems.map((s) => [s.id, s])));

	// Download every ready stem as one zip, built in the browser from the Blob
	// files (they allow cross-origin reads). Stored, not compressed: audio
	// does not shrink and stored entries stream straight through.
	let zipping = $state<string | null>(null);

	// MP3 mixdown: "original" is every stem at unity (cached on the server);
	// "custom" is what the player has audible right now — mute, solo and faders.
	// Song sections: the list in settings edits index, name and start. (The player
	// can also offer "Add section at playhead" via its onaddsection prop; off for now.)
	let sectionRows = $state<
		{ index: string; name: string; time: string; shown: string; seconds: number | null }[]
	>([]);
	let sectionError = $state<string | null>(null);
	let sectionsSaving = $state(false);
	function resetSectionRows() {
		sectionRows = data.song.sections.map((s) => ({
			index: s.index ?? "",
			name: s.name,
			time: editPos(s.start),
			shown: editPos(s.start),
			seconds: s.start,
		}));
	}
	async function persistSections(next: SongSection[]) {
		sectionError = null;
		sectionsSaving = true;
		try {
			await saveSections({ id: data.song.id, sections: next });
			await invalidateAll();
			resetSectionRows();
			notify("Sections saved");
		} catch (e) {
			sectionError = errorMessage(e);
		} finally {
			sectionsSaving = false;
		}
	}
	async function saveSectionRows() {
		const parsed: SongSection[] = [];
		for (const row of sectionRows) {
			const start = rowSeconds(row);
			if (start === null) {
				sectionError = positionMessage(row.time);
				return;
			}
			parsed.push({ index: row.index, name: row.name, start });
		}
		await persistSections(parsed);
	}

	// Tempo / key / time signature changes: rows of time (m:ss.s), kind and value.
	let changeRows = $state<
		{ time: string; shown: string; seconds: number | null; kind: SongChangeKind; value: string }[]
	>([]);
	let changeError = $state<string | null>(null);
	let changesSaving = $state(false);
	function resetChangeRows() {
		changeRows = data.song.changes.map((c) => ({
			time: editPos(c.start),
			shown: editPos(c.start),
			seconds: c.start,
			kind: c.kind,
			value: c.value,
		}));
	}
	// "Scan stems": the upload-time detector again, on the buffers the player already
	// holds. Fills empty settings straight away; offers to replace filled ones.
	let scanning = $state(false);
	let scanResult = $state<{
		detection: Detection;
		summary: string;
		current: string;
		applied: boolean;
	} | null>(null);
	function detectionValues(d: Detection): { kind: SongChangeKind; value: string }[] {
		return [
			...(d.tempo.bpm ? [{ kind: "tempo" as const, value: String(Math.round(d.tempo.bpm)) }] : []),
			...(d.key.value ? [{ kind: "key" as const, value: d.key.value }] : []),
			...(d.tempo.bpm ? [{ kind: "meter" as const, value: d.meter.value }] : []),
		];
	}
	const describe = (rows: { kind: SongChangeKind; value: string }[]) =>
		rows.map((r) => (r.kind === "tempo" ? `${r.value} bpm` : r.value)).join(" · ") || "nothing";
	async function scanStems() {
		if (!playerEngine || playerEngine.status !== "ready") return;
		scanning = true;
		scanResult = null;
		try {
			// Yield first so the button repaints; the analysis blocks the thread for a moment.
			await new Promise((r) => setTimeout(r, 30));
			const combined = combineFeatures(playerEngine.buffers().map((b) => extractFeatures(b)));
			if (!combined) return;
			const detection = analyse(combined);
			const values = detectionValues(detection);
			if (values.length === 0) {
				notify("Nothing could be detected from these stems", { kind: "info" });
				return;
			}
			const existing = data.song.changes.filter((c) => c.start === 0);
			if (existing.length === 0) {
				await saveChanges({
					id: data.song.id,
					changes: [...data.song.changes, ...values.map((r) => ({ ...r, start: 0 }))],
				});
				await invalidateAll();
				resetChangeRows();
				scanResult = { detection, summary: describe(values), current: "", applied: true };
				notify("Tempo, key and time signature set from the stems");
			} else {
				scanResult = {
					detection,
					summary: describe(values),
					current: describe(existing.map((c) => ({ kind: c.kind, value: c.value }))),
					applied: false,
				};
			}
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		} finally {
			scanning = false;
		}
	}
	// "Detect chords": Basic Pitch on the tonal stems, one chord per bar on the
	// song's grid; then "Draft chart with AI" turns them into sections, a
	// progression per section and a chart, each saved on request.
	let chordBusy = $state<string | null>(null);
	let chordSegments = $state<ChordSegment[] | null>(null);
	let chordBars = $state<{ bar: number; notes: string }[]>([]);
	let chordError = $state<string | null>(null);
	let draft = $state<(ChartDraftAnswer & { chartHtml: string }) | null>(null);
	let draftBusy = $state(false);
	/** Bumped by Cancel: a run whose number no longer matches drops its result. */
	let draftRun = 0;
	class DraftCancelled extends Error {}
	function cancelDraft() {
		draftRun++;
		chordBusy = null;
		draftBusy = false;
		notify("Cancelled", { kind: "info" });
	}
	async function detectChords(run = ++draftRun) {
		const grid = posCtx.grid;
		if (!playerEngine || playerEngine.status !== "ready" || !grid) return;
		const cancelled = () => run !== draftRun;
		chordBusy = "Listening…";
		chordError = null;
		chordSegments = null;
		draft = null;
		try {
			const duration = playerEngine.duration;
			// The server transcribes after upload; use its notes when they cover the song,
			// otherwise transcribe here (the server copy keeps growing in the background).
			const stored = await songNotes({ id: data.song.id }).catch(() => null);
			if (cancelled()) return;
			let notes: Note[];
			if (stored?.complete) {
				notes = stored.notes;
			} else {
				chordBusy =
					stored && stored.doneSeconds > 0
						? `Listening… (server ${Math.round((100 * stored.doneSeconds) / Math.max(1, stored.duration))}% done)`
						: "Listening…";
				const { transcribeNotes } = await import("$lib/audio/transcribe");
				const buffers = playerEngine.buffers();
				const features = buffers.map((b) => extractFeatures(b, 30));
				const top = Math.max(...features.map((f) => f.tonal), 1e-9);
				notes = await transcribeNotes(
					buffers.map((buffer, i) => ({ buffer, weight: features[i].tonal / top })),
					duration,
					(p) => {
						if (cancelled()) throw new DraftCancelled();
						chordBusy = `Listening… ${Math.round(p * 100)}%`;
					},
				);
			}
			if (cancelled()) return;
			const barStarts: number[] = [];
			for (let bar = 1; bar < 2000; bar++) {
				const t = secondsAtBar(grid, bar);
				if (t > duration) break;
				barStarts.push(t);
			}
			barStarts.push(Math.min(duration, secondsAtBar(grid, barStarts.length + 1)));
			if (import.meta.env.DEV)
				(window as unknown as { __stemNotes?: unknown }).__stemNotes = { notes, barStarts };
			chordSegments = chordsPerBar(notes, barStarts);
			chordBars = describeBars(notes, barStarts);
			if (chordSegments.length === 0)
				chordError = "No bars to read; check the tempo and time signature.";
		} catch (e) {
			if (cancelled() || e instanceof DraftCancelled) return;
			chordError = errorMessage(e);
			notify(`Chord detection failed: ${chordError}`, { kind: "error" });
		} finally {
			if (!cancelled()) chordBusy = null;
		}
	}
	/** The chart panel's button: detect chords first when that has not run, then draft. */
	async function draftFromPanel() {
		const run = ++draftRun;
		if (!chordSegments) await detectChords(run);
		if (chordSegments && run === draftRun) await draftFromChords(run);
	}
	async function draftFromChords(run = ++draftRun) {
		if (!chordSegments) return;
		const cancelled = () => run !== draftRun;
		draftBusy = true;
		chordError = null;
		try {
			const answer = await draftChart({
				id: data.song.id,
				chords: chordSegments.map((c) => ({ bar: c.bar, bars: c.bars, chord: c.chord })),
				bars: chordBars,
			});
			if (cancelled()) return;
			draft = answer;
		} catch (e) {
			if (cancelled()) return;
			chordError = errorMessage(e);
			notify(`The draft failed: ${chordError}`, { kind: "error" });
		} finally {
			if (!cancelled()) draftBusy = false;
		}
	}
	/** The model's chords ("D5 % A5 …") as chart lines, four bars each. */
	function aiChordLines(chords: string): string {
		const cells = chords.split(/\s+/).filter(Boolean);
		const lines: string[] = [];
		for (let i = 0; i < cells.length; i += 4)
			lines.push(`| ${cells.slice(i, i + 4).join(" | ")} |`);
		return lines.join("\n");
	}
	async function saveDraftSections() {
		const grid = posCtx.grid;
		if (!draft || !grid) return;
		if (
			data.song.sections.length > 0 &&
			!confirm("Replace the song's sections with the drafted ones?")
		)
			return;
		try {
			await saveSections({
				id: data.song.id,
				sections: draft.sections.map((s) => ({
					index: s.index,
					name: s.name,
					start: secondsAtBar(grid, s.bar),
				})),
			});
			await invalidateAll();
			resetSectionRows();
			notify("Sections saved from the draft");
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		}
	}
	async function saveDraftChart() {
		if (!draft) return;
		const hasChart = !!data.docs.chart;
		if (hasChart && !confirm("Replace the song's chart with the drafted one?")) return;
		try {
			await saveChartDraft({ id: data.song.id, markdown: draft.chart, replace: hasChart });
			await invalidateAll();
			notify("Chart saved from the draft");
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		}
	}
	async function replaceFromScan() {
		if (!scanResult) return;
		const values = detectionValues(scanResult.detection);
		const replaced = new Set(values.map((r) => r.kind));
		const kept = data.song.changes.filter((c) => !(c.start === 0 && replaced.has(c.kind)));
		try {
			await saveChanges({
				id: data.song.id,
				changes: [...kept, ...values.map((r) => ({ ...r, start: 0 }))],
			});
			await invalidateAll();
			resetChangeRows();
			notify("Tempo, key and time signature replaced from the stems");
			scanResult = { ...scanResult, applied: true };
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		}
	}

	// "Ask AI to check": a second opinion on the rendered mix (src/lib/server/aiDetect.ts);
	// "Use these" puts the answer into the rows at 0:00 for the user to save.
	let aiBusy = $state(false);
	let aiAnswer = $state<AiAnswer | null>(null);
	let aiError = $state<string | null>(null);
	async function askAi() {
		aiBusy = true;
		aiError = null;
		try {
			aiAnswer = await askAiAboutSong({ id: data.song.id });
		} catch (e) {
			aiError = errorMessage(e);
		} finally {
			aiBusy = false;
		}
	}
	function useAiAnswer() {
		if (!aiAnswer) return;
		// Rows at 0:00 for what the model is sure of (no row for a free tempo or no meter),
		// plus a tempo row at each shift; other rows the user typed stay.
		const at0: { kind: SongChangeKind; value: string }[] = [
			...(aiAnswer.tempo === null
				? []
				: [{ kind: "tempo" as const, value: String(Math.round(aiAnswer.tempo)) }]),
			...(aiAnswer.key ? [{ kind: "key" as const, value: aiAnswer.key }] : []),
			...(aiAnswer.meter === "free" ? [] : [{ kind: "meter" as const, value: aiAnswer.meter }]),
		];
		const replaced = new Set(at0.map((r) => r.kind));
		const rows = changeRows.filter(
			(r) =>
				!((r.seconds === 0 && replaced.has(r.kind)) || (r.kind === "tempo" && r.seconds !== 0)),
		);
		for (const { kind, value } of at0) {
			rows.push({ time: editPos(0), shown: editPos(0), seconds: 0, kind, value });
		}
		for (const c of aiAnswer.tempoChanges) {
			rows.push({
				time: editPos(c.at),
				shown: editPos(c.at),
				seconds: c.at,
				kind: "tempo",
				value: String(Math.round(c.bpm)),
			});
		}
		changeRows = rows;
		aiAnswer = null;
	}
	async function saveChangeRows() {
		changeError = null;
		const parsed: SongChange[] = [];
		for (const row of changeRows) {
			const start = rowSeconds(row);
			if (start === null) {
				changeError = positionMessage(row.time);
				return;
			}
			const bad = songChangeValueError(row.kind, row.value);
			if (bad) {
				changeError = `${SONG_CHANGE_LABELS[row.kind]} at ${row.time}: ${bad}`;
				return;
			}
			parsed.push({ kind: row.kind, start, value: row.value.trim() });
		}
		changesSaving = true;
		try {
			await saveChanges({ id: data.song.id, changes: parsed });
			await invalidateAll();
			resetChangeRows();
			notify("Tempo, key and time signature saved");
		} catch (e) {
			changeError = errorMessage(e);
		} finally {
			changesSaving = false;
		}
	}

	// A stem row's menu is a <details>; it closes on Escape, on a click outside
	// it, and when another menu opens (that click is outside the first).
	function closeStemMenus(e: Event) {
		for (const menu of document.querySelectorAll<HTMLDetailsElement>(
			"details[data-stem-menu][open]",
		)) {
			if (e.type === "pointerdown" && menu.contains(e.target as Node)) continue;
			menu.open = false;
		}
	}

	// The MIDI badge toggles a piano roll in place of the row's waveform; files
	// are fetched from Blob and parsed once per URL.
	let midiViews = $state<Record<string, MidiSummary>>({});
	const midiCache = new Map<string, Promise<MidiSummary>>();
	async function toggleMidiView(stemId: string) {
		if (midiViews[stemId]) {
			midiViews = Object.fromEntries(Object.entries(midiViews).filter(([id]) => id !== stemId));
			return;
		}
		const url = stemRows.get(stemId)?.midiUrl;
		if (!url) return;
		let parsed = midiCache.get(url);
		if (!parsed) {
			parsed = fetch(url).then(async (res) => {
				if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
				return parseMidi(await res.arrayBuffer());
			});
			midiCache.set(url, parsed);
		}
		try {
			midiViews = { ...midiViews, [stemId]: await parsed };
		} catch (e) {
			midiCache.delete(url);
			alert(`Could not read the MIDI file: ${errorMessage(e)}`);
		}
	}

	// A stem's optional MIDI file: uploaded from the row menu; a badge on the row when present.
	let midiJobs = $state<Record<string, { percent: number; error?: string }>>({});
	async function uploadMidi(stemId: string, input: HTMLInputElement) {
		const file = input.files?.[0];
		input.value = "";
		if (!file) return;
		if (!midiContentType(file.name)) {
			midiJobs = {
				...midiJobs,
				[stemId]: { percent: 0, error: `${file.name} is not a MIDI file (.mid or .midi).` },
			};
			return;
		}
		if (file.size > MIDI_MAX_BYTES) {
			midiJobs[stemId] = {
				percent: 0,
				error: `${file.name} is over ${formatBytes(MIDI_MAX_BYTES)}.`,
			};
			return;
		}
		midiJobs = { ...midiJobs, [stemId]: { percent: 0 } };
		try {
			await uploadMidiFile(
				stemId,
				file,
				(percent) => (midiJobs = { ...midiJobs, [stemId]: { percent } }),
			);
			await invalidateAll();
			// Reassign rather than delete: a removed key does not notify the row.
			midiJobs = Object.fromEntries(Object.entries(midiJobs).filter(([id]) => id !== stemId));
		} catch (e) {
			midiJobs = {
				...midiJobs,
				[stemId]: { percent: 0, error: errorMessage(e) },
			};
		}
	}

	// Share by email: the song's public link plus a note, sent through Resend.
	let sharePanel = $state<HTMLDivElement | null>(null);
	let shareTo = $state("");
	let shareMessage = $state("");
	let shareBusy = $state(false);
	let shareError = $state<string | null>(null);
	async function sendShare(e: SubmitEvent) {
		e.preventDefault();
		shareError = null;
		shareBusy = true;
		try {
			const { sent } = await shareSong({
				songId: data.song.id,
				to: shareTo,
				message: shareMessage,
			});
			shareTo = "";
			shareMessage = "";
			notify(`Sent to ${sent}`);
			sharePanel?.hidePopover();
		} catch (err) {
			shareError = errorMessage(err);
		} finally {
			shareBusy = false;
		}
	}

	/**
	 * What the uploader heard in a batch of stems. A song with no tempo, key
	 * or time signature yet gets them as its first changes; one that has them
	 * only hears the detection, so nothing typed is overwritten.
	 */
	async function applyDetection(d: Detection) {
		const parts = [
			d.tempo.bpm ? `${Math.round(d.tempo.bpm)} bpm` : "",
			d.key.value,
			d.tempo.bpm ? d.meter.value : "",
		].filter(Boolean);
		if (parts.length === 0) return;
		const summary = parts.join(" · ");
		if (data.song.changes.length > 0) {
			notify(`Detected ${summary}; the song's own settings are kept`, { kind: "info" });
			return;
		}
		const changes = [
			...(d.tempo.bpm
				? [{ kind: "tempo" as const, start: 0, value: String(Math.round(d.tempo.bpm)) }]
				: []),
			...(d.key.value ? [{ kind: "key" as const, start: 0, value: d.key.value }] : []),
			...(d.tempo.bpm ? [{ kind: "meter" as const, start: 0, value: d.meter.value }] : []),
		];
		try {
			await saveChanges({ id: data.song.id, changes });
			await invalidateAll();
			resetChangeRows();
			notify(
				`Detected ${summary} — set as the song's tempo, key and time signature. Change them in settings.`,
				{
					timeout: 12_000,
				},
			);
		} catch (e) {
			notify(`Detected ${summary}, but it could not be saved: ${errorMessage(e)}`, {
				kind: "error",
			});
		}
	}

	// The player's engine, for the custom mix (the download row lives outside the player).
	let playerEngine = $state<StemEngine | null>(null);
	let player = $state<StemPlayer | null>(null);
	/** The song's default mix per stem; the faders start here for everyone. */
	let defaultGains = $derived(new Map(data.manifest.stems.map((s) => [s.id, s.gain ?? 1])));
	/** The listener moved something (fader, mute, solo or master) away from the default mix. */
	let mixDirty = $derived(
		!!playerEngine &&
			(playerEngine.master !== 1 ||
				playerEngine.stems.some(
					(s) => s.muted || s.soloed || Math.abs(s.gain - (defaultGains.get(s.id) ?? 1)) > 1e-6,
				)),
	);
	/** The faders alone differ from the default: there is a new default to save. */
	let fadersDirty = $derived(
		!!playerEngine &&
			playerEngine.stems.some((s) => Math.abs(s.gain - (defaultGains.get(s.id) ?? 1)) > 1e-6),
	);
	let savingMix = $state(false);
	async function saveMixAsDefault() {
		if (!playerEngine || savingMix) return;
		if (!confirm("Save these fader levels as the default mix for everyone who opens this song?"))
			return;
		savingMix = true;
		try {
			await saveDefaultMix({
				id: data.song.id,
				gains: playerEngine.stems.map((s) => ({
					id: s.id,
					gain: Math.round(s.gain * 1000) / 1000,
				})),
			});
			player?.forgetLocalMix();
			await invalidateAll();
			notify("Saved as the default mix; the original mixdown is re-rendering");
		} catch (e) {
			notify(`Could not save the mix: ${errorMessage(e)}`, { kind: "error" });
		} finally {
			savingMix = false;
		}
	}
	let mixing = $state<MixMode | null>(null);
	let mixError = $state<string | null>(null);
	/** `project-song-v1.2.3`: every download names the song version it was made from. */
	let downloadStem = $derived(`${data.song.project.slug}-${data.song.slug}-v${data.song.version}`);

	async function downloadMix(mixMode: MixMode, engine?: StemEngine) {
		if (mixing) return;
		mixError = null;
		const query = mixQuery(mixMode, engine);
		if (query === null) {
			mixError = "Nothing is audible — unmute a stem first.";
			return;
		}
		mixing = mixMode;
		try {
			await saveMix(data.song.id, downloadStem, mixMode, query);
		} catch (e) {
			mixError = errorMessage(e);
		} finally {
			mixing = null;
		}
	}
	async function downloadAll() {
		if (ready.length === 0 || zipping) return;
		zipping = "Preparing…";
		try {
			await saveStemsZip(ready, downloadStem);
		} finally {
			zipping = null;
		}
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === "Escape") {
			closeStemMenus(e);
			stemMenuAt = null;
		}
	}}
	onpointerdown={(e) => {
		closeStemMenus(e);
		closeStemContext(e);
	}}
/>

<svelte:head>
	<title>{data.song.title} — Stem Shovel</title>
</svelte:head>

<main
	class="page-x-padding pt-6 mb-2 grid grid-cols-1 xl-grid-cols-2 gap-8"
	data-song-id={data.song.id}
>
	<!-- 1. header: title, description, song settings -->
	<header class="grid gap-3 col-span-full">
		<div class="flex flex-wrap items-baseline justify-between gap-4">
			<!-- song header & metadata -->
			<div class="flex flex-wrap items-baseline gap-4">
				<h1 class="heading-2 mb-0">
					{#if data.song.isPrivate || data.song.project.isPrivate}
						<span
							class="i-ph-lock mr-1 inline-block align-[-2px] text-18px opacity-70"
							title="Private: members and viewing links only"
							aria-label="Private"
						></span>
					{/if}{data.song.title}{#if data.song.noAi || data.song.project.noAi}
						<span
							class="ml-2 inline-block rounded border border-white/20 px-1.5 py-0.5 align-middle text-10px uppercase tracking-wider opacity-70"
							title="No AI touches this song">no AI</span
						>{/if}{#if data.song.isFinished}
						<span
							class="ml-2 inline-block rounded border border-white/20 px-1.5 py-0.5 align-middle text-10px uppercase tracking-wider opacity-70"
							title="Marked as finished">finished</span
						>{/if}
				</h1>
				<span>v{data.song.version}</span>
				<span class="opacity-90 text-15px"
					>a song in the <a
						class="underline underline-offset-2"
						href="/{data.account.slug}/projects/{data.song.project.slug}"
						>{data.song.project.name}</a
					>
					project from
					<a class="underline underline-offset-2" href="/{data.account.slug}/projects"
						>{data.account.name}</a
					></span
				>
			</div>

			<!-- settings button -->
			{#if data.canEdit}
				<div class="flex gap-2">
					<button
						class="block hover-text-accent opacity-90 border border-transparent px-1 py-1 rounded hover-opacity-100"
						type="button"
						popovertarget="song-share"
						title="Share this song by email"
						aria-label="Share this song by email"
					>
						<span class="block i-ph-paper-plane-tilt"></span>
					</button>
					<button
						class="block hover-text-accent opacity-90 border border-transparent px-1 py-1 rounded hover-opacity-100"
						type="button"
						popovertarget="song-info"
						title="About this song"
						aria-label="About this song"
					>
						<span class="block i-ph-info"></span>
					</button>
					<button
						class="block hover-text-accent opacity-90 border border-transparent px-1 py-1 rounded hover-opacity-100"
						type="button"
						popovertarget="song-settings"
						title="Song settings"
						aria-label="Song settings"
					>
						<span class="block i-ph-gear"></span>
					</button>
				</div>
			{/if}
		</div>
	</header>

	{#if data.canEdit}
		<!-- Settings as a native popover: top layer, light-dismiss, Esc closes. -->
		<div
			id="song-settings"
			popover="auto"
			onbeforetoggle={(e) => {
				if (e.newState === "open") {
					clearForm(updateSong); // saved values, not the last edit
					positionError = null;
					resetSectionRows();
					resetChangeRows();
					startAtEntry = startAtText;
					endAtEntry = endAtText;
				}
			}}
			bind:this={settingsPanel}
			class="m-auto max-h-[calc(100vh-2rem)] overflow-y-auto w-[min(40rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
		>
			<div class="mb-4 flex items-center justify-between gap-4">
				<h2 class="heading-2 mb-0">Song settings</h2>
				<button
					class="button button-xs"
					type="button"
					popovertarget="song-settings"
					popovertargetaction="hide"
				>
					Close
				</button>
			</div>
			<form
				{...updateSong.enhance(async ({ submit }) => {
					positionError = null;
					for (const [label, text, field, shown, stored] of [
						["Start of bar 1", startAtEntry, fields.startAt, startAtText, data.song.startAt],
						["End", endAtEntry, fields.endAt, endAtText, data.song.endAt],
					] as const) {
						const seconds = !text.trim() ? 0 : rowSeconds({ time: text, shown, seconds: stored });
						if (seconds === null) {
							positionError = `${label}: ${positionMessage(text)}`;
							return;
						}
						field.set(text.trim() ? String(seconds) : "");
					}
					await submit();
					if (!fields.allIssues()) {
						notify("Song settings saved");
						settingsPanel?.hidePopover();
					}
				})}
			>
				<input {...fields.id.as("hidden", data.song.id)} />
				<div class="grid gap-4 sm:grid-cols-2">
					<label class="block">
						<span class="text-sm text-dim">Title</span>
						<input
							class="mt-1 field"
							{...fields.title.as("text", data.song.title)}
							oninput={(e) => {
								if (!slugTouched) fields.slug.set(slugify(e.currentTarget.value));
							}}
							required
						/>
						{#each fields.title.issues() ?? [] as issue (issue.message)}
							<p class="mt-1 text-sm text-red-400">{issue.message}</p>
						{/each}
					</label>
					<label class="block">
						<span class="text-sm text-dim">URL</span>
						<span class="mt-1 flex items-center rounded border border-white/15 bg-black/20">
							<span class="truncate pl-3 text-sm text-dim">/projects/{data.song.project.slug}/</span
							>
							<input
								class="block w-full bg-transparent py-2 pr-3 font-mono text-sm"
								{...fields.slug.as("text", data.song.slug)}
								oninput={() => (slugTouched = true)}
								required
							/>
						</span>
						{#each fields.slug.issues() ?? [] as issue (issue.message)}
							<p class="mt-1 text-sm text-red-400">{issue.message}</p>
						{/each}
						{#if slug !== slugify(title)}
							<button
								class="mt-1 text-xs link-dim"
								type="button"
								onclick={() => {
									fields.slug.set(slugify(title));
									slugTouched = false;
								}}>Use title</button
							>
						{/if}
					</label>
					<label class="block">
						<span class="text-sm text-dim"
							>Songwriter <span class="opacity-60">(optional)</span></span
						>
						<input
							class="mt-1 field"
							{...fields.songwriter.as("text", data.song.songwriter)}
							placeholder="Who wrote it"
						/>
						{#each fields.songwriter.issues() ?? [] as issue (issue.message)}
							<p class="mt-1 text-sm text-red-400">{issue.message}</p>
						{/each}
					</label>
					<label class="block">
						<span class="text-sm text-dim"
							>First written <span class="opacity-60">(optional)</span></span
						>
						<input
							class="mt-1 field"
							type="date"
							{...fields.writtenOn.as("text", data.song.writtenOn ?? "")}
						/>
						{#each fields.writtenOn.issues() ?? [] as issue (issue.message)}
							<p class="mt-1 text-sm text-red-400">{issue.message}</p>
						{/each}
					</label>
					<label class="block">
						<span class="text-sm text-dim"
							>Start of bar 1 <span class="opacity-60">(optional)</span></span
						>
						<span class="mt-1 flex items-center gap-2">
							<input
								class="field font-mono text-sm"
								placeholder={POSITION_PLACEHOLDER[mode]}
								autocomplete="off"
								bind:value={startAtEntry}
								aria-label="Start of bar 1"
							/>
							<input {...fields.startAt.as("hidden", "")} />
							<button
								class="button button-xs shrink-0"
								type="button"
								title="Use the transport's current position"
								disabled={!playerEngine || playerEngine.status !== "ready"}
								onclick={() => (startAtEntry = editPos(playerEngine?.position ?? 0))}
							>
								Playhead
							</button>
						</span>
						<span class="mt-1 block text-xs text-dim"
							>Leading silence or a count-in: bars are counted from here.</span
						>
						{#each fields.startAt.issues() ?? [] as issue (issue.message)}
							<p class="mt-1 text-sm text-red-400">{issue.message}</p>
						{/each}
					</label>
					<label class="block">
						<span class="text-sm text-dim">End <span class="opacity-60">(optional)</span></span>
						<span class="mt-1 flex items-center gap-2">
							<input
								class="field font-mono text-sm"
								placeholder={POSITION_PLACEHOLDER[mode]}
								autocomplete="off"
								bind:value={endAtEntry}
								aria-label="End"
							/>
							<input {...fields.endAt.as("hidden", "")} />
							<button
								class="button button-xs shrink-0"
								type="button"
								title="Use the transport's current position"
								disabled={!playerEngine || playerEngine.status !== "ready"}
								onclick={() => (endAtEntry = editPos(playerEngine?.position ?? 0))}
							>
								Playhead
							</button>
						</span>
						<span class="mt-1 block text-xs text-dim">Where the song ends, for the bars total.</span
						>
						{#each fields.endAt.issues() ?? [] as issue (issue.message)}
							<p class="mt-1 text-sm text-red-400">{issue.message}</p>
						{/each}
					</label>
					<label class="block">
						<span class="text-sm text-dim">Version</span>
						<input
							class="mt-1 field font-mono text-sm"
							placeholder="0.0.1"
							autocomplete="off"
							{...fields.version.as("text", data.song.version)}
						/>
						<span class="mt-1 block text-xs text-dim">
							Yours to manage (major.minor.patch); after stems change you are offered a bump.
						</span>
						{#each fields.version.issues() ?? [] as issue (issue.message)}
							<p class="mt-1 text-sm text-red-400">{issue.message}</p>
						{/each}
					</label>
					<label class="block">
						<span class="text-sm text-dim"
							>Frame rate <span class="opacity-60">(timecode)</span></span
						>
						<select
							class="mt-1 field text-sm"
							{...fields.frameRate.as("select", String(data.song.frameRate))}
						>
							{#each FRAME_RATES as rate (rate)}
								<option value={String(rate)}>{rate} fps</option>
							{/each}
						</select>
					</label>
					<p class="text-xs text-dim self-end pb-2">
						Positions read and are typed as {POSITION_MODE_LABELS[mode].toLowerCase()} — the transport's
						readout sets the format. Any of time (1:23.4), timecode (01:23:15.72) or bars (12|3) is accepted
						anywhere.
					</p>
					<label class="block sm:col-span-2">
						<span class="text-sm text-dim"
							>Description <span class="opacity-60">(optional)</span></span
						>
						<textarea
							class="mt-1 field text-sm"
							rows="3"
							{...fields.description.as("text", data.song.description)}></textarea>
						{#each fields.description.issues() ?? [] as issue (issue.message)}
							<p class="mt-1 text-sm text-red-400">{issue.message}</p>
						{/each}
					</label>
				</div>
				{#if positionError}
					<p class="mt-2 text-sm text-red-400" role="alert">{positionError}</p>
				{/if}
				{#if slug.trim() !== data.song.slug}
					<p class="mt-2 text-xs text-dim">Changing the URL breaks existing links to this song.</p>
				{/if}
				<div class="mt-4">
					<button
						class="button-accent disabled:opacity-40"
						disabled={!settingsDirty || !!updateSong.pending}
					>
						{updateSong.pending ? "Saving…" : "Save"}
					</button>
				</div>
			</form>

			<div class="mt-8 border-t border-white/15 pt-4">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<h3 class="text-15px font-700">Sections</h3>
					<button
						class="button button-xs"
						type="button"
						onclick={() =>
							(sectionRows = [
								...sectionRows,
								{
									index: toRoman(sectionRows.length + 1),
									name: "",
									time: editPos(0),
									shown: "",
									seconds: null,
								},
							])}
					>
						<span class="i-ph-plus" aria-hidden="true"></span>
						Add row
					</button>
				</div>
				<p class="mt-1 text-sm text-dim">
					Song structure for the timeline above the stems: a short index (roman numerals, shown on
					the timeline; the name shows on hover), a name, and where it starts — time, timecode or
					bars.
				</p>
				{#if sectionRows.length > 0}
					<div class="mt-3 grid gap-2">
						{#each sectionRows as row, i (i)}
							<div class="grid grid-cols-[4rem_1fr_7rem_auto] items-center gap-2">
								<input
									class="field font-mono text-sm"
									placeholder="I"
									bind:value={row.index}
									aria-label="Section index"
									title="Short index shown on the timeline (roman numerals); the name shows on hover"
								/>
								<input
									class="field"
									placeholder="Intro"
									bind:value={row.name}
									aria-label="Section name"
								/>
								<input
									class="field font-mono text-sm"
									placeholder={POSITION_PLACEHOLDER[mode]}
									bind:value={row.time}
									aria-label="Start time"
								/>
								<button
									class="link-dim text-xs"
									type="button"
									onclick={() => (sectionRows = sectionRows.filter((_, j) => j !== i))}
									>Remove</button
								>
							</div>
						{/each}
					</div>
				{/if}
				{#if sectionError}
					<p class="mt-2 text-sm text-red-400" role="alert">{sectionError}</p>
				{/if}
				<div class="mt-3 flex items-center gap-3">
					<button
						class="button-accent disabled:opacity-40"
						type="button"
						disabled={sectionsSaving}
						onclick={saveSectionRows}
					>
						{sectionsSaving ? "Saving…" : "Save sections"}
					</button>
					<button class="link-dim text-xs" type="button" onclick={resetSectionRows}
						>Discard changes</button
					>
				</div>
			</div>

			<div class="mt-8 border-t border-white/15 pt-4">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<h3 class="text-15px font-700">Tempo, key and time signature</h3>
					<div class="flex items-center gap-2">
						<button
							class="button button-xs"
							type="button"
							disabled={scanning || !playerEngine || playerEngine.status !== "ready"}
							title={playerEngine?.status === "ready"
								? "Listen to the loaded stems for tempo, key and time signature"
								: "Available once every stem has decoded"}
							onclick={scanStems}
						>
							<span class="i-ph-waveform" aria-hidden="true"></span>
							{scanning ? "Scanning…" : "Scan stems"}
						</button>
						{#if !data.noAi}
							<button
								class="button button-xs"
								type="button"
								disabled={!!chordBusy ||
									!playerEngine ||
									playerEngine.status !== "ready" ||
									!posCtx.grid}
								title={!posCtx.grid
									? "Needs a tempo and a time signature first"
									: "Transcribe the tonal stems and read a chord per bar (takes a while)"}
								onclick={() => detectChords()}
							>
								<span class="i-ph-music-notes" aria-hidden="true"></span>
								{chordBusy ?? "Detect chords"}
							</button>
							{#if chordBusy || draftBusy}
								<button class="button button-xs" type="button" onclick={cancelDraft}>Cancel</button>
							{/if}
						{/if}
						{#if data.aiAvailable}
							<button
								class="button button-xs"
								type="button"
								disabled={aiBusy}
								title="Send the rendered mix to a model that listens and reports tempo, key and time signature"
								onclick={askAi}
							>
								<span class="i-ph-sparkle" aria-hidden="true"></span>
								{aiBusy ? "Listening…" : "Ask AI to check"}
							</button>
						{/if}
						<button
							class="button button-xs"
							type="button"
							onclick={() =>
								(changeRows = [
									...changeRows,
									{
										time: changeRows.length ? "" : editPos(0),
										shown: "",
										seconds: null,
										kind: "tempo",
										value: "",
									},
								])}
						>
							<span class="i-ph-plus" aria-hidden="true"></span>
							Add change
						</button>
					</div>
				</div>
				{#if chordError}<p class="mt-2 text-sm text-red-400" role="alert">{chordError}</p>{/if}
				{#if chordSegments}
					<div class="mt-2 rounded bg-white/5 px-3 py-2 text-sm">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<span
								>Chords by bar ({chordSegments.reduce((n, c) => n + c.bars, 0)} bars,
								{Math.round(
									(chordSegments.reduce((n, c) => n + c.confidence * c.bars, 0) /
										Math.max(
											1,
											chordSegments.reduce((n, c) => n + c.bars, 0),
										)) *
										100,
								)}% sure on average)</span
							>
							<span class="flex items-center gap-3">
								{#if data.aiAvailable}
									<button
										class="link-dim"
										type="button"
										disabled={draftBusy}
										onclick={() => draftFromChords()}
									>
										{draftBusy ? "Drafting…" : "Draft chart with AI"}
									</button>
								{/if}
								<button
									class="link-dim"
									type="button"
									onclick={() => ((chordSegments = null), (draft = null))}>Dismiss</button
								>
							</span>
						</div>
						<pre class="mt-2 whitespace-pre-wrap font-mono text-12px opacity-90">{chordChart(
								chordSegments,
							)}</pre>
					</div>
				{/if}
				{#if draft}{@render draftCard()}{/if}
				{#if scanResult}
					<p class="mt-2 rounded bg-white/5 px-3 py-2 text-sm">
						{#if scanResult.applied}
							Set from the stems: <strong>{scanResult.summary}</strong>. Adjust below if the song
							knows better.
						{:else}
							The stems suggest <strong>{scanResult.summary}</strong>; the song has
							{scanResult.current}. Replace?
							<button class="ml-2 link-dim" type="button" onclick={replaceFromScan}>Replace</button>
							<button class="ml-2 link-dim" type="button" onclick={() => (scanResult = null)}
								>Keep current</button
							>
						{/if}
					</p>
				{/if}
				{#if aiAnswer}
					<p class="mt-2 rounded bg-white/5 px-3 py-2 text-sm">
						AI hears <strong
							>{aiAnswer.tempo === null ? "no fixed tempo" : `${Math.round(aiAnswer.tempo)} bpm`} · {aiAnswer.key}
							· {aiAnswer.meter === "free" ? "no meter" : aiAnswer.meter}</strong
						>{#if aiAnswer.tempoChanges.length > 0}
							, then {aiAnswer.tempoChanges
								.map((c) => `${Math.round(c.bpm)} bpm at ${editPos(c.at)}`)
								.join(", ")}{/if}
						({Math.round(aiAnswer.confidence * 100)}% sure){aiAnswer.notes
							? ` — ${aiAnswer.notes}`
							: ""}
						<button class="ml-2 link-dim" type="button" onclick={useAiAnswer}>Use these</button>
						<button class="ml-2 link-dim" type="button" onclick={() => (aiAnswer = null)}
							>Dismiss</button
						>
					</p>
				{/if}
				{#if aiError}<p class="mt-2 text-sm text-red-400" role="alert">{aiError}</p>{/if}
				<p class="mt-1 text-sm text-dim">
					Each from the time it starts (0:00.0 for the song's own tempo, key and time signature;
					later rows are changes). They show on the timeline above the stems.
				</p>
				{#if changeRows.length > 0}
					<div class="mt-3 grid gap-2">
						{#each changeRows as row, i (i)}
							<div class="grid grid-cols-[6rem_9rem_1fr_auto] items-center gap-2">
								<input
									class="field font-mono text-sm"
									placeholder={POSITION_PLACEHOLDER[mode]}
									bind:value={row.time}
									aria-label="Change time"
								/>
								<select class="field text-sm" bind:value={row.kind} aria-label="What changes">
									{#each SONG_CHANGE_KINDS as kind (kind)}
										<option value={kind}>{SONG_CHANGE_LABELS[kind]}</option>
									{/each}
								</select>
								<input
									class="field font-mono text-sm"
									placeholder={row.kind === "tempo" ? "120" : row.kind === "key" ? "F#m" : "4/4"}
									list={row.kind === "meter" ? "time-signatures" : undefined}
									autocomplete="off"
									bind:value={row.value}
									aria-label="Value"
								/>
								<button
									class="link-dim text-xs"
									type="button"
									onclick={() => (changeRows = changeRows.filter((_, j) => j !== i))}>Remove</button
								>
							</div>
						{/each}
					</div>
					<datalist id="time-signatures">
						{#each ["4/4", "3/4", "6/8", "2/4", "5/4", "7/8", "12/8"] as ts (ts)}
							<option value={ts}></option>
						{/each}
					</datalist>
				{/if}
				{#if changeError}
					<p class="mt-2 text-sm text-red-400" role="alert">{changeError}</p>
				{/if}
				<div class="mt-3 flex items-center gap-3">
					<button
						class="button-accent disabled:opacity-40"
						type="button"
						disabled={changesSaving}
						onclick={saveChangeRows}
					>
						{changesSaving ? "Saving…" : "Save changes"}
					</button>
					<button class="link-dim text-xs" type="button" onclick={resetChangeRows}
						>Discard edits</button
					>
				</div>
			</div>

			<div class="mt-8 border-t border-white/15 pt-4">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<h3 class="text-15px font-700">Demo recordings</h3>
					<label
						class="button button-sm lg-button-xs cursor-pointer {demoBusy
							? 'opacity-50 pointer-events-none'
							: ''}"
					>
						<span class="i-ph-plus" aria-hidden="true"></span>
						{demoBusy ? "Uploading…" : "Upload demo"}
						<input
							class="sr-only"
							type="file"
							accept={DEMO_ACCEPT}
							multiple
							disabled={demoBusy}
							onchange={(e) => uploadDemos(e.currentTarget)}
						/>
					</label>
				</div>
				<p class="mt-1 text-sm text-dim">
					Phone memos, rough takes, the original idea — any audio format; each is converted to MP3
					for listening and download. Up to {MAX_DEMOS_PER_SONG}.
				</p>
				{#if demoNotice}
					<p class="mt-2 text-sm text-red-400" role="alert">{demoNotice}</p>
				{/if}
				{#each demoJobs as job (job.name)}
					<p class="mt-2 text-sm {job.error ? 'text-red-400' : 'text-dim'}">
						{job.name}: {job.error ?? `${job.percent.toFixed(0)}%`}
					</p>
				{/each}
				{#if data.song.demos.length > 0}
					<ul class="mt-3 grid gap-1">
						{#each data.song.demos as d (d.id)}
							{@const remove = deleteDemo.for(d.id)}
							<li
								class="flex items-center justify-between gap-3 rounded border border-white/10 px-3 py-2 text-sm"
							>
								<span class="min-w-0 truncate">
									{d.label}
									<span class="text-dim"
										>· {formatBytes(d.sizeBytes)}{#if d.status !== "ready"}
											· uploading{:else if d.playbackStatus !== "ready"}
											· converting to MP3…{/if}</span
									>
									<form
										{...remove.enhance(async ({ submit }) => {
											if (!confirm(`Remove the demo "${d.label}"?`)) return;
											await submit();
										})}
									>
										<input {...remove.fields.id.as("hidden", d.id)} />
										<button class="link-dim text-xs" disabled={!!remove.pending}>
											{remove.pending ? "Removing…" : "Remove"}
										</button>
									</form>
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			<div class="mt-8 border-t border-white/15 pt-4">
				<FinishedToggle
					id={data.song.id}
					finished={data.song.isFinished}
					canChange={data.canEdit}
				/>
			</div>

			<div class="mt-8 border-t border-white/15 pt-4">
				<AiToggle
					kind="song"
					id={data.song.id}
					noAi={data.song.noAi}
					inherited={data.song.project.noAi}
					canChange={data.canEdit}
				/>
			</div>

			<div class="mt-8 border-t border-white/15 pt-4">
				<PrivacyToggle
					kind="song"
					id={data.song.id}
					isPrivate={data.song.isPrivate}
					inherited={data.song.project.isPrivate}
					canChange={data.canEdit}
				/>
			</div>

			<div class="mt-8 border-t border-white/15 pt-4">
				<h3 class="text-15px font-700 text-red-400">Delete this song</h3>
				<p class="mt-1 text-sm text-dim">
					Removes the song, its chart, lyrics and notes, every stem file and every demo recording.
				</p>
				<form
					class="mt-3"
					{...deleteSong.enhance(async ({ submit }) => {
						if (!confirm(`Delete "${data.song.title}" and all of its stems?`)) return;
						await submit();
					})}
				>
					<input {...deleteSong.fields.id.as("hidden", data.song.id)} />
					<button
						class="button text-red-400 hover-bg-red-400 hover-text-oxford"
						disabled={!!deleteSong.pending}
					>
						<span class="i-ph-trash" aria-hidden="true"></span>
						{deleteSong.pending ? "Deleting…" : "Delete song"}
					</button>
				</form>
			</div>
		</div>
	{/if}

	<!-- 2. player: transport + waveforms, with the stem actions -->
	<section class="grid grid-cols-1 place-content-start min-h-560px" aria-label="Player">
		<!-- transport and waveforms -->
		{#if data.manifest.stems.length > 0}
			<div class="mb-5">
				<StemPlayer
					manifest={data.manifest}
					{stemMenu}
					{stemBadge}
					{midiViews}
					sections={data.song.sections}
					changes={data.song.changes}
					startAt={data.song.startAt}
					endAt={data.song.endAt}
					fps={data.song.frameRate}
					onengine={(e) => (playerEngine = e)}
					onstemcontext={onStemContext}
					{afterRows}
					songId={data.song.id}
					bind:this={player}
				>
					{#snippet errorHint()}
						A stem's file is missing from the Blob store. Remove it from its menu and upload it
						again.
					{/snippet}
				</StemPlayer>
			</div>
		{:else}
			<!-- The player's box, empty: the page keeps its shape before the first stem arrives. -->
			<div
				class="mb-5 grid min-h-560px place-content-center rounded-md border border-current/40 bg-blue/5 px-4 py-3 text-center"
			>
				<p class="text-sm text-dim">No stems yet.</p>
				{#if data.canEdit}
					<p class="mt-1 text-sm opacity-80">
						Add stems below, or start with a demo recording of the idea.
					</p>
				{/if}
			</div>
		{/if}

		{@render headerExtras?.(playerEngine ?? undefined)}

		{#if versionOffer && data.canEdit}
			<div
				class="mb-2 flex flex-wrap items-center gap-3 rounded-md border border-current/40 bg-blue-300/5 px-3 py-2 text-sm"
				role="status"
			>
				<span>Stems changed. Bump the song version from v{data.song.version}?</span>
				<button
					class="button button-xs"
					type="button"
					disabled={versionBusy}
					onclick={() => bump("patch")}
				>
					{bumpVersion(data.song.version, "patch")}
				</button>
				<button
					class="button button-xs"
					type="button"
					disabled={versionBusy}
					onclick={() => bump("minor")}
				>
					{bumpVersion(data.song.version, "minor")}
				</button>
				<button
					class="button button-xs"
					type="button"
					disabled={versionBusy}
					onclick={() => bump("major")}
				>
					{bumpVersion(data.song.version, "major")}
				</button>
				<button class="link-dim text-xs" type="button" onclick={() => (versionOffer = false)}
					>Keep v{data.song.version}</button
				>
			</div>
		{/if}
		<!-- upload notice -->
		{#if uploadNotice}
			<p class="text-sm px-3 py-2 border border-current/40 rounded-md mb-2 bg-blue-300/5">
				{uploadNotice}
			</p>
		{/if}

		{#if uploadJobs.length > 0}
			<ul class="divide-y divide-white/10" aria-live="polite" aria-label="Uploading">
				{#each uploadJobs as job (job.file.name)}
					<li class="px-4 py-3">
						<div class="flex items-baseline justify-between gap-4 text-sm">
							<span class="truncate">{job.file.name}</span>
							<span class="shrink-0 text-dim">
								{#if job.status === "error"}failed{:else if job.status === "done"}{formatBytes(
										job.file.size,
									)}{:else if job.status === "decoding"}decoding…{:else if job.status === "uploading"}{Math.round(
										job.percent,
									)}%{:else}queued{/if}
							</span>
						</div>
						<div class="mt-2 h-1 overflow-hidden rounded bg-white/10">
							<div
								class="h-full {job.status === 'error' ? 'bg-red-400' : 'bg-maximumYellow'}"
								style:width="{job.percent}%"
							></div>
						</div>
						{#if job.error}<p class="mt-1 text-xs text-red-400">{job.error}</p>{/if}
					</li>
				{/each}
			</ul>
		{/if}

		{#if pending.length > 0}
			<ul class="mt-4 surface divide-y divide-white/10 text-sm" aria-label="Stems not ready">
				{#each pending as stem (stem.id)}
					{@const job = replacing[stem.id]}
					{@const remove = deleteStem.for(stem.id)}
					<li class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2">
						<span class="truncate">
							{stem.label}
							<span class="text-dim">
								· {stem.filename} · {job
									? job.stage === "uploading"
										? `${Math.round(job.percent)}%`
										: job.stage
									: "not ready — the upload was interrupted"}
							</span>
						</span>
						<span class="flex items-center gap-3">
							{#if data.canEdit}
								<label class="cursor-pointer link-dim">
									Upload file
									<input
										class="sr-only"
										type="file"
										accept={STEM_ACCEPT}
										disabled={!!job}
										onchange={(e) => replaceStem(stem.id, e.currentTarget)}
									/>
								</label>
								<form {...remove}>
									<input {...remove.fields.id.as("hidden", stem.id)} />
									<button class="link-dim" disabled={!!remove.pending}>Remove</button>
								</form>
							{/if}
						</span>
						{#if job?.error}<p class="w-full text-xs text-red-400">{job.error}</p>{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- 3. chart, lyrics & notes -->
	<section
		class="grid gap-2 grid-cols-1 place-content-[start_stretch] h-full min-h-560px max-w-full overflow-hidden grid-rows-1fr relative"
		aria-label="Chart, lyrics, notes and comments"
	>
		<!-- <div class="h-full relative"> -->
		{#if panel === "comments"}
			<div
				class="h-full min-h-full max-h-[70vh] overflow-y-auto bg-blue-300/5 border rounded-md border-current/40 px-6 pt-12 pb-8"
			>
				{#if data.comments.length === 0}
					<p class="opacity-80">No comments yet.</p>
				{:else}
					<ol class="grid gap-4">
						{#each data.comments as c (c.id)}
							{@const remove = deleteComment.for(c.id)}
							<li
								class="rounded-md border border-white/10 bg-black/20 px-4 py-3"
								id="comment-{c.id}"
							>
								<div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
									<h3 class="font-600">{c.title}</h3>
									<span class="text-12px opacity-70">
										{c.authorName} · {formatDate(c.createdAt)}
										{#if c.editedAt}<span
												class="ml-1 rounded border border-current/30 px-1 text-9px uppercase tracking-wider"
												title="Edited {formatDate(c.editedAt)}">edited</span
											>{/if}
									</span>
								</div>
								{#if c.at !== null}
									<button
										type="button"
										class="mt-1 text-12px link-dim"
										onclick={() => playerEngine?.seek(c.at ?? 0)}
										title="Go to this position"
									>
										<span class="i-ph-map-pin mr-1" aria-hidden="true"></span>{showPos(c.at)}
									</button>
								{/if}
								<p class="mt-2 whitespace-pre-line text-15px">{c.body}</p>
								{#if canEditComment(c) || canDeleteComment(c)}
									<div class="mt-2 flex gap-3 text-12px">
										{#if canEditComment(c)}
											<button type="button" class="link-dim" onclick={() => editComment(c)}
												>Edit</button
											>
										{/if}
										{#if canDeleteComment(c)}
											<form
												{...remove.enhance(async ({ submit }) => {
													if (!confirm(`Delete the comment "${c.title}"?`)) return;
													await submit();
													notify("Comment deleted");
												})}
											>
												<input {...remove.fields.id.as("hidden", c.id)} />
												<button class="link-dim" disabled={!!remove.pending}>
													{remove.pending ? "Deleting…" : "Delete"}
												</button>
											</form>
										{/if}
									</div>
								{/if}
							</li>
						{/each}
					</ol>
				{/if}
			</div>
		{:else}
			{#key doc}
				<SongDocPanel
					bind:this={docPanel}
					songId={data.song.id}
					kind={doc}
					label={DOC_LABELS[doc]}
					hint={DOC_HINTS[doc]}
					markdown={DOC_TEXT[doc]}
					html={data.docs[doc]}
					version={DOC_VERSION[doc]}
					canEdit={data.canEdit}
					bind:editing={docEditing}
					bind:saving={docSaving}
					view={docView}
					above={panel === "chart" ? draftInPanel : undefined}
				/>
			{/key}
		{/if}
		<!-- tool bar  -->
		<div class="absolute top-2 right-3 mb-2 flex items-stretch gap-4">
			<div
				class="flex overflow-hidden rounded border border-white/15 items-center"
				role="tablist"
				aria-label="Document"
			>
				{#each PANELS as kind, index (kind)}
					<button
						type="button"
						role="tab"
						aria-selected={panel === kind}
						class="{panel === kind
							? 'button button-xs bg-blue-300 text-oxford border-blue-300 hover-bg-blue-200 hover-border-blue-200'
							: 'button button-xs opacity-80 hover-bg-blue-200 hover-border-blue-200'} {index === 0
							? 'rounded-r-none border-r-none'
							: index === PANELS.length - 1
								? 'rounded-l-none'
								: 'rounded-none border-r-none'}"
						onclick={async () => {
							if (kind === panel) return;
							if (docEditing) await docPanel?.close();
							docEditing = false;
							panel = kind;
						}}>{PANEL_LABELS[kind]}</button
					>
				{/each}
			</div>
			<div class="flex items-stretch gap-2 {data.canEdit ? '' : 'hidden'}">
				{#if panel === "comments"}
					<button
						class="button button-xs flex items-center"
						type="button"
						title="Add a comment"
						aria-label="Add a comment"
						onclick={() => openComment()}
					>
						<span class="i-ph-plus"></span>
					</button>
				{:else}
					<button
						class="button button-xs flex items-center {docEditing
							? 'bg-blue-300 text-oxford border-blue-300'
							: ''}"
						type="button"
						title={docEditing ? `Done editing the ${doc}` : `Edit the ${doc} here`}
						aria-label={docEditing ? `Done editing the ${doc}` : `Edit the ${doc}`}
						aria-pressed={docEditing}
						onclick={async () => {
							if (docEditing) await docPanel?.close();
							else docEditing = true;
						}}
					>
						<span
							class={docEditing
								? docSaving
									? "i-ph-circle-notch animate-spin"
									: "i-ph-check"
								: data.docs[doc]
									? "i-ph-pencil"
									: "i-ph-plus"}
						></span>
					</button>
				{/if}
				<!--
				Panel menu: the editor's pane while editing, and the chart's AI draft.
				Always present (with a placeholder when empty) so the toolbar never shifts.
			-->
				<details class="relative flex" bind:this={chartMenuEl}>
					<summary
						class="button button-xs flex items-center list-none [&::-webkit-details-marker]:hidden"
						title="More"
						aria-label="{PANEL_LABELS[panel]} menu"
					>
						<span
							class={draftBusy || chordBusy
								? "i-ph-circle-notch animate-spin"
								: "i-ph-dots-three-outline-vertical-fill"}
							aria-hidden="true"
						></span>
					</summary>
					<div
						class="absolute top-full right-0 z-20 mt-1 min-w-56 rounded border border-white/15 bg-oxford p-1 text-sm shadow-lg"
						role="menu"
					>
						{#if !docEditing && !(panel === "chart" && data.aiAvailable)}
							<div class="px-2 py-1 text-xs text-dim">Nothing to do here yet</div>
						{/if}
						{#if docEditing}
							{#each DOC_VIEWS as v (v.id)}
								<button
									class="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-white/10"
									type="button"
									role="menuitemradio"
									aria-checked={docView === v.id}
									onclick={() => {
										docView = v.id;
										if (chartMenuEl) chartMenuEl.open = false;
									}}
								>
									<span class="i-ph-check {docView === v.id ? '' : 'invisible'}" aria-hidden="true"
									></span>{v.name}
								</button>
							{/each}
							{#if panel === "chart" && data.aiAvailable}
								<hr class="my-1 border-white/15" />
							{/if}
						{/if}
						{#if panel === "chart" && data.aiAvailable}
							{#if draftBusy || chordBusy}
								<div class="px-2 py-1 text-xs text-dim">{draftBusy ? "Drafting…" : chordBusy}</div>
								<button
									class="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-white/10"
									type="button"
									role="menuitem"
									onclick={() => {
										if (chartMenuEl) chartMenuEl.open = false;
										cancelDraft();
									}}
								>
									<span class="i-ph-x" aria-hidden="true"></span>Cancel
								</button>
							{:else}
								<button
									class="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-white/10 disabled:opacity-40"
									type="button"
									role="menuitem"
									disabled={!playerEngine || playerEngine.status !== "ready" || !posCtx.grid}
									title={!posCtx.grid
										? "Needs a tempo and a time signature first (song settings)"
										: playerEngine?.status !== "ready"
											? "Available once every stem has decoded"
											: "Transcribe the stems and have the AI draft sections, progressions and a chart"}
									onclick={() => {
										if (chartMenuEl) chartMenuEl.open = false;
										draftFromPanel();
									}}
								>
									<span class="i-ph-sparkle" aria-hidden="true"></span>Draft chart with AI
								</button>
							{/if}
						{/if}
					</div>
				</details>
			</div>
		</div>
		<!-- </div> -->
	</section>
</main>

{#if readyDemos.length > 0}
	<div
		id="song-demos"
		popover="auto"
		class="m-auto max-h-[calc(100vh-2rem)] overflow-y-auto w-[min(32rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
	>
		<div class="mb-4 flex items-center justify-between gap-4">
			<h2 class="heading-2 mb-0">Demo recordings</h2>
			<button
				class="button button-xs"
				type="button"
				popovertarget="song-demos"
				popovertargetaction="hide"
			>
				Close
			</button>
		</div>
		{#if demoTrack}
			<!-- svelte-ignore a11y_media_has_caption -->
			<audio
				bind:this={demoAudio}
				src={demoTrack.playbackUrl ?? demoTrack.url}
				bind:paused={demoPaused}
				preload="auto"
				onended={() => (demoPaused = true)}
			></audio>
		{/if}
		<ul class="grid gap-2">
			{#each readyDemos as d (d.id)}
				<li class="flex items-center gap-3 rounded border border-white/10 px-3 py-2">
					<button
						type="button"
						class="grid h-9 w-9 shrink-0 place-items-center rounded bg-maximumYellow text-oxford active:scale-95"
						aria-label={demoPlaying === d.id && !demoPaused
							? `Pause ${d.label}`
							: `Play ${d.label}`}
						onclick={() => playDemo(d.id)}
					>
						<span
							class={demoPlaying === d.id && !demoPaused ? "i-ph-pause-fill" : "i-ph-play-fill"}
							aria-hidden="true"
						></span>
					</button>
					<span class="min-w-0 grow truncate">
						{d.label}
						<span class="block text-xs text-dim">{formatBytes(d.sizeBytes)}</span>
					</span>
					<button
						type="button"
						class="button button-xs"
						title={d.playbackUrl ? `Download ${d.label}.mp3` : `Download ${d.filename}`}
						onclick={() =>
							d.playbackUrl ? saveAs(d.playbackUrl, `${d.label}.mp3`) : saveAs(d.url, d.filename)}
					>
						<span class="i-ph-download-simple" aria-hidden="true"></span>
						Download
					</button>
				</li>
			{/each}
		</ul>
	</div>
{/if}

{#snippet headerExtras(engine?: StemEngine)}
	<div
		class="flex flex-wrap items-center gap-3 w-full border py-4 px-3 rounded-md border-current/40 bg-blue-300/5 text-15px"
	>
		{#if data.canEdit}
			<StemUploader
				songId={data.song.id}
				stemCount={data.song.stems.length}
				bind:jobs={uploadJobs}
				bind:notice={uploadNotice}
				onuploaded={() => (versionOffer = true)}
				onanalysis={applyDetection}
			/>
			{#if data.song.stems.length > 0}
				<StemReplacer
					songId={data.song.id}
					stems={data.song.stems.map((s) => ({ id: s.id, label: s.label, filename: s.filename }))}
					bind:jobs={uploadJobs}
					bind:notice={uploadNotice}
					onuploaded={() => (versionOffer = true)}
					onanalysis={applyDetection}
				/>
			{/if}
		{/if}
		{#if ready.length > 0}
			<button
				class="button button-sm lg-button-xs"
				type="button"
				disabled={!!zipping}
				onclick={downloadAll}
				title="Download all stems"
			>
				<span class="i-ph-download-simple" aria-hidden="true"></span>
				{zipping ?? "Download Stems"}
			</button>
			<button
				class="button button-sm lg-button-xs"
				type="button"
				disabled={!!mixing}
				onclick={() => downloadMix("original", engine)}
				title="Download an MP3 of the full mix"
			>
				<span class="i-ph-download-simple" aria-hidden="true"></span>
				{mixing === "original" ? "Rendering…" : "Original Mix (MP3)"}
			</button>
			<button
				class="button button-sm lg-button-xs"
				type="button"
				disabled={!!mixing}
				onclick={() => downloadMix("custom", engine)}
				title="Download an MP3 of what is audible now (mute, solo, faders)"
			>
				<span class="i-ph-download-simple" aria-hidden="true"></span>
				{mixing === "custom" ? "Rendering…" : "Custom Mix (MP3)"}
			</button>
			{#if mixError}
				<p class="w-full text-sm text-red-400" role="alert">{mixError}</p>
			{/if}
		{/if}
		{#if engine && mixDirty}
			<button
				class="button button-sm lg-button-xs"
				type="button"
				onclick={() => player?.resetMix()}
				title="Back to the song's default mix (your own levels are kept in this browser only)"
			>
				<span class="i-ph-arrow-counter-clockwise" aria-hidden="true"></span>
				Reset Mix
			</button>
		{/if}
		{#if data.canEdit && engine && fadersDirty}
			<button
				class="button button-sm lg-button-xs"
				type="button"
				disabled={savingMix}
				onclick={saveMixAsDefault}
				title="Save these fader levels as the default mix for every listener"
			>
				<span class="i-ph-floppy-disk" aria-hidden="true"></span>
				{savingMix ? "Saving…" : "Save as Default Mix"}
			</button>
		{/if}
		{#if readyDemos.length > 0}
			<button
				class="button button-sm lg-button-xs"
				type="button"
				popovertarget="song-demos"
				title="Listen to or download the demo recordings"
			>
				<span class="i-ph-microphone" aria-hidden="true"></span>
				Demos ({readyDemos.length})
			</button>
		{/if}
		{#if data.canEdit && ready.length === 0}
			<!-- A song idea starts with a demo more often than a stem; once stems exist, demos are managed in settings. -->
			<label
				class="button button-sm lg-button-xs cursor-pointer {demoBusy
					? 'opacity-50 pointer-events-none'
					: ''}"
				title="Upload demo recordings: phone memos, rough takes, the original idea ({DEMO_FORMAT_LIST})"
			>
				<span class="i-ph-microphone" aria-hidden="true"></span>
				{demoBusy ? "Uploading…" : "Add Demos"}
				<input
					class="sr-only"
					type="file"
					accept={DEMO_ACCEPT}
					multiple
					disabled={demoBusy || readyDemos.length >= MAX_DEMOS_PER_SONG}
					onchange={(e) => uploadDemos(e.currentTarget)}
				/>
			</label>
			{#if demoNotice}
				<p class="w-full text-sm text-red-400" role="alert">{demoNotice}</p>
			{/if}
		{/if}
	</div>
{/snippet}

<!-- Song info: what the header used to spell out, for anyone who opens it. -->
<div
	id="song-info"
	popover="auto"
	class="m-auto max-h-[calc(100vh-2rem)] overflow-y-auto w-[min(32rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
>
	<div class="mb-4 flex items-center justify-between gap-4">
		<h2 class="heading-2 mb-0">{data.song.title}</h2>
		<button
			class="button button-xs"
			type="button"
			popovertarget="song-info"
			popovertargetaction="hide"
		>
			Close
		</button>
	</div>
	<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-15px">
		{#if data.song.description}
			<dt class="opacity-70">About</dt>
			<dd class="max-w-prose whitespace-pre-line">{data.song.description}</dd>
		{/if}
		{#if writtenLine}
			<dt class="opacity-70">Written</dt>
			<dd>{writtenLine.replace(/^Written by /, "")}</dd>
		{/if}
		{#if metaLine}
			<dt class="opacity-70">Music</dt>
			<dd>{metaLine}</dd>
		{/if}
		<dt class="opacity-70">Version</dt>
		<dd>v{data.song.version}</dd>
		<dt class="opacity-70">Stems</dt>
		<dd>
			{ready.length}
			{ready.length === 1 ? "stem" : "stems"}{#if data.song.stemsUpdatedAt}, last changed {formatDate(
					data.song.stemsUpdatedAt,
				)}{/if}
		</dd>
		<dt class="opacity-70">Project</dt>
		<dd>
			<a class="link-dim" href="/{data.account.slug}/projects/{data.song.project.slug}"
				>{data.song.project.name}</a
			>
			from {data.account.name}
		</dd>
	</dl>
	{#if !data.song.description && !writtenLine && !metaLine && data.canEdit}
		<p class="mt-4 text-sm opacity-70">
			Add a description, songwriter, tempo, key and time signature in song settings.
		</p>
	{/if}
</div>

{#if data.canEdit}
	<div
		id="song-share"
		popover="auto"
		bind:this={sharePanel}
		class="m-auto max-h-[calc(100vh-2rem)] overflow-y-auto w-[min(32rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
	>
		<div class="mb-4 flex items-center justify-between gap-4">
			<h2 class="heading-2 mb-0">Share by email</h2>
			<button
				class="button button-xs"
				type="button"
				popovertarget="song-share"
				popovertargetaction="hide"
			>
				Close
			</button>
		</div>
		<p class="mb-3 text-sm text-dim">
			{#if data.song.isPrivate || data.song.project.isPrivate}
				Sends a viewing link to this song, made for the recipient (it appears below and can be
				revoked). With it they can listen, read the chart and download the mixes.
			{:else}
				Sends the link to this page. Anyone with it can listen, read the chart and download the
				mixes.
			{/if}
		</p>
		<form class="grid gap-3" onsubmit={sendShare}>
			<label class="block">
				<span class="text-sm text-dim">To</span>
				<input class="mt-1 field" type="email" bind:value={shareTo} required autocomplete="off" />
			</label>
			<label class="block">
				<span class="text-sm text-dim">Note <span class="opacity-60">(optional)</span></span>
				<textarea class="mt-1 field text-sm" rows="3" bind:value={shareMessage}></textarea>
			</label>
			{#if shareError}<p class="text-sm text-red-400" role="alert">{shareError}</p>{/if}
			<button class="button-accent justify-self-start" disabled={shareBusy}>
				{shareBusy ? "Sending…" : "Send"}
			</button>
		</form>
		<div class="mt-6 border-t border-white/15 pt-4">
			<ShareLinks
				target={{ songId: data.song.id }}
				links={data.shareLinks}
				path="/{data.account.slug}/projects/{data.song.project.slug}/{data.song.slug}"
				isPrivate={data.song.isPrivate || data.song.project.isPrivate}
			/>
		</div>
	</div>
{/if}

{#if data.canEdit}
	<!-- One popover for posting and editing a comment. -->
	<div
		id="song-comment"
		popover="auto"
		bind:this={commentPanel}
		class="m-auto max-h-[calc(100vh-2rem)] overflow-y-auto w-[min(32rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
	>
		<div class="mb-4 flex items-center justify-between gap-4">
			<h2 class="heading-2 mb-0">{commentDraft.id ? "Edit comment" : "Add a comment"}</h2>
			<button
				class="button button-xs"
				type="button"
				popovertarget="song-comment"
				popovertargetaction="hide"
			>
				Close
			</button>
		</div>
		{#if commentDraft.id}
			{@const remoteForm = updateComment}
			<form
				class="grid gap-3"
				{...remoteForm.enhance(async ({ submit }) => {
					commentError = null;
					await submit();
					if (!remoteForm.fields.allIssues()) {
						notify("Comment updated");
						commentPanel?.hidePopover();
					}
				})}
			>
				<input {...remoteForm.fields.id.as("hidden", commentDraft.id)} />
				<label class="block">
					<span class="text-sm opacity-80">Title</span>
					<input
						class="mt-1 field"
						{...remoteForm.fields.title.as("text", commentDraft.title)}
						required
					/>
					{#each remoteForm.fields.title.issues() ?? [] as issue (issue.message)}
						<p class="mt-1 text-sm text-red-400">{issue.message}</p>
					{/each}
				</label>
				<label class="block">
					<span class="text-sm opacity-80">Comment</span>
					<textarea
						class="mt-1 field text-sm"
						rows="5"
						{...remoteForm.fields.body.as("text", commentDraft.body)}
						required></textarea>
					{#each remoteForm.fields.body.issues() ?? [] as issue (issue.message)}
						<p class="mt-1 text-sm text-red-400">{issue.message}</p>
					{/each}
				</label>
				<label class="block">
					<span class="text-sm opacity-80">Position <span class="opacity-60">(optional)</span></span
					>
					<span class="mt-1 flex items-center gap-2">
						<input
							class="field font-mono text-sm"
							placeholder={POSITION_PLACEHOLDER[mode]}
							{...remoteForm.fields.position.as("text", commentDraft.at)}
						/>
						<button
							class="button button-xs shrink-0"
							type="button"
							disabled={!playerEngine || playerEngine.status !== "ready"}
							onclick={() => remoteForm.fields.position.set(editPos(playerEngine?.position ?? 0))}
							>Playhead</button
						>
					</span>
					{#each remoteForm.fields.position.issues() ?? [] as issue (issue.message)}
						<p class="mt-1 text-sm text-red-400">{issue.message}</p>
					{/each}
				</label>
				{#if commentError}<p class="text-sm text-red-400" role="alert">{commentError}</p>{/if}
				<button class="button-accent justify-self-start" disabled={!!remoteForm.pending}
					>{remoteForm.pending ? "Saving…" : "Save"}</button
				>
			</form>
		{:else}
			{@const remoteForm = createComment}
			<form
				class="grid gap-3"
				{...remoteForm.enhance(async ({ submit }) => {
					commentError = null;
					await submit();
					if (!remoteForm.fields.allIssues()) {
						notify("Comment posted");
						panel = "comments";
						commentPanel?.hidePopover();
					}
				})}
			>
				<input {...remoteForm.fields.songId.as("hidden", data.song.id)} />
				<label class="block">
					<span class="text-sm opacity-80">Title</span>
					<input
						class="mt-1 field"
						{...remoteForm.fields.title.as("text", commentDraft.title)}
						required
					/>
					{#each remoteForm.fields.title.issues() ?? [] as issue (issue.message)}
						<p class="mt-1 text-sm text-red-400">{issue.message}</p>
					{/each}
				</label>
				<label class="block">
					<span class="text-sm opacity-80">Comment</span>
					<textarea
						class="mt-1 field text-sm"
						rows="5"
						{...remoteForm.fields.body.as("text", commentDraft.body)}
						required></textarea>
					{#each remoteForm.fields.body.issues() ?? [] as issue (issue.message)}
						<p class="mt-1 text-sm text-red-400">{issue.message}</p>
					{/each}
				</label>
				<label class="block">
					<span class="text-sm opacity-80">Position <span class="opacity-60">(optional)</span></span
					>
					<span class="mt-1 flex items-center gap-2">
						<input
							class="field font-mono text-sm"
							placeholder={POSITION_PLACEHOLDER[mode]}
							{...remoteForm.fields.position.as("text", commentDraft.at)}
						/>
						<button
							class="button button-xs shrink-0"
							type="button"
							disabled={!playerEngine || playerEngine.status !== "ready"}
							onclick={() => remoteForm.fields.position.set(editPos(playerEngine?.position ?? 0))}
							>Playhead</button
						>
					</span>
					{#each remoteForm.fields.position.issues() ?? [] as issue (issue.message)}
						<p class="mt-1 text-sm text-red-400">{issue.message}</p>
					{/each}
				</label>
				{#if commentError}<p class="text-sm text-red-400" role="alert">{commentError}</p>{/if}
				<button class="button-accent justify-self-start" disabled={!!remoteForm.pending}
					>{remoteForm.pending ? "Posting…" : "Post comment"}</button
				>
			</form>
		{/if}
	</div>
{/if}

{#if stemMenuAt}
	<!-- Ctrl / ⌘-click menu at the pointer -->
	<div
		class="fixed z-40 w-56 rounded border border-white/15 bg-oxford-800 p-1 text-sm shadow-lg shadow-black/50"
		style:left="{Math.min(stemMenuAt.x, window.innerWidth - 240)}px"
		style:top="{stemMenuAt.y + 4}px"
		role="menu"
		data-stem-context
	>
		<div class="truncate px-3 py-1.5 text-xs opacity-70">
			{stemMenuAt.stem.label} · {showPos(stemMenuAt.seconds)}
		</div>
		<button
			class="block w-full rounded px-3 py-1.5 text-left hover:bg-white/10"
			type="button"
			role="menuitem"
			onclick={() => {
				playerEngine?.seek(stemMenuAt?.seconds ?? 0);
				stemMenuAt = null;
			}}
		>
			<span class="i-ph-skip-forward mr-2" aria-hidden="true"></span>Seek here
		</button>
		{#if data.canEdit}
			<button
				class="block w-full rounded px-3 py-1.5 text-left hover:bg-white/10"
				type="button"
				role="menuitem"
				onclick={() => {
					const at = editPos(stemMenuAt?.seconds ?? 0);
					stemMenuAt = null;
					openComment({ at });
				}}
			>
				<span class="i-ph-chat-circle-dots mr-2" aria-hidden="true"></span>Comment here
			</button>
		{/if}
	</div>
{/if}

{#snippet commentCard(id: string)}
	{@const c = data.comments.find((x) => x.id === id)}
	{#if c}
		{@const remove = deleteComment.for(`timeline:${c.id}`)}
		<div class="flex items-baseline justify-between gap-3">
			<h3 class="font-600">{c.title}</h3>
			{#if c.editedAt}<span
					class="rounded border border-current/30 px-1 text-9px uppercase tracking-wider"
					>edited</span
				>{/if}
		</div>
		<p class="mt-1 text-12px opacity-70">
			{c.authorName} · {formatDate(c.createdAt)}{#if c.at !== null}
				· {showPos(c.at)}{/if}
		</p>
		<p class="mt-2 whitespace-pre-line">{c.body}</p>
		<div class="mt-3 flex gap-3 text-12px">
			{#if c.at !== null}
				<button type="button" class="link-dim" onclick={() => playerEngine?.seek(c.at ?? 0)}
					>Go to</button
				>
			{/if}
			{#if canEditComment(c)}
				<button type="button" class="link-dim" onclick={() => editComment(c)}>Edit</button>
			{/if}
			{#if canDeleteComment(c)}
				<form
					{...remove.enhance(async ({ submit }) => {
						if (!confirm(`Delete the comment "${c.title}"?`)) return;
						await submit();
						notify("Comment deleted");
					})}
				>
					<input {...remove.fields.id.as("hidden", c.id)} />
					<button class="link-dim" disabled={!!remove.pending}
						>{remove.pending ? "Deleting…" : "Delete"}</button
					>
				</form>
			{/if}
		</div>
	{/if}
{/snippet}

{#snippet draftCard()}
	{#if draft}
		<div class="mt-2 rounded bg-white/5 px-3 py-2 text-sm">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<span class="font-600">AI draft</span>
				<span class="flex items-center gap-3">
					<button class="link-dim" type="button" onclick={saveDraftSections}>Save sections</button>
					<button class="link-dim" type="button" onclick={saveDraftChart}>Save as chart</button>
					<button class="link-dim" type="button" onclick={() => (draft = null)}>Discard</button>
				</span>
			</div>
			{#if draft.chords.trim()}
				<details class="mt-2 text-12px">
					<summary class="cursor-pointer text-dim">Chords by bar</summary>
					<pre class="mt-1 whitespace-pre-wrap font-mono opacity-90">{aiChordLines(
							draft.chords,
						)}</pre>
				</details>
			{/if}
			<p class="mt-1 text-13px">
				<!-- Unkeyed on purpose: a draft is replaced whole, and section names repeat (two verses). -->
				{#each draft.sections as sec, i}{i > 0 ? " · " : ""}{sec.index}
					{sec.name} @ bar {sec.bar}{/each}
			</p>
			<ul class="mt-1 text-13px opacity-90">
				{#each draft.progressions as pr}
					<li><span class="font-600">{pr.section}:</span> {pr.chords}</li>
				{/each}
			</ul>
			{#if draft.notes}<p class="mt-1 text-12px text-dim">{draft.notes}</p>{/if}
			<!-- The suggested chart as it would look once saved (the panel's chart-body typography). -->
			<article class="mt-3 chart-body rounded-md border border-current/40 bg-blue-300/5 px-6 py-6">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized server-side in renderMarkdown -->
				{@html draft.chartHtml}
			</article>
			<details class="mt-1 text-12px">
				<summary class="cursor-pointer text-dim">Chart markdown</summary>
				<pre class="mt-1 whitespace-pre-wrap rounded bg-black/20 p-2 opacity-90">{draft.chart}</pre>
			</details>
		</div>
	{/if}
{/snippet}

{#snippet draftInPanel()}
	{#if chordError}<p class="mb-4 text-sm text-red-400" role="alert">{chordError}</p>{/if}
	{#if draft}
		<div class="mb-6">{@render draftCard()}</div>
	{/if}
{/snippet}

{#snippet afterRows()}
	<!-- Members always see the row, so they learn comments exist; visitors only when there are some. -->
	{#if playerEngine && (locatedComments.length > 0 || data.canEdit)}
		<CommentTimeline
			engine={playerEngine}
			comments={locatedComments}
			card={commentCard}
			canComment={data.canEdit}
		/>
	{/if}
{/snippet}

{#snippet stemBadge(stem: StemState)}
	{#if stemRows.get(stem.id)?.midiUrl}
		<MidiBadge active={!!midiViews[stem.id]} onclick={() => toggleMidiView(stem.id)} />
	{/if}
{/snippet}

{#snippet stemMenu(stem: StemState)}
	{@const row = stemRows.get(stem.id)}
	{@const job = replacing[stem.id]}
	{@const remove = deleteStem.for(stem.id)}
	{@const dropMidi = removeStemMidi.for(stem.id)}
	{@const midi = midiJobs[stem.id]}
	{#if row}
		<details class="relative" data-stem-menu>
			<summary
				class="grid h-6 w-6 cursor-pointer list-none place-items-center rounded border border-white/10 text-lg leading-none hover:border-white/60 [&::-webkit-details-marker]:hidden"
				title="{stem.label}: options"
				aria-label="{stem.label}: options"
				><span class="i-ph-dots-three-bold" aria-hidden="true"></span></summary
			>
			<div
				class="absolute left-0 z-20 mt-1 w-56 rounded border border-white/15 bg-oxford-800 p-1 text-sm shadow-lg shadow-black/50"
			>
				<div class="truncate px-3 py-1.5 text-xs text-dim">
					{row.filename} · {formatBytes(row.sizeBytes)}
				</div>
				<button
					class="block w-full rounded px-3 py-1.5 text-left hover:bg-white/10"
					type="button"
					onclick={() => saveAs(row.url, row.filename)}
				>
					<span class="i-ph-download-simple mr-2" aria-hidden="true"></span>Download Stem
				</button>
				{#if row.midiUrl && row.midiFilename}
					<button
						class="block w-full rounded px-3 py-1.5 text-left hover:bg-white/10"
						type="button"
						onclick={() => saveAs(row.midiUrl ?? "", row.midiFilename ?? "stem.mid")}
					>
						<span class="i-ph-music-notes mr-2" aria-hidden="true"></span>Download MIDI
					</button>
				{/if}
				{#if data.canEdit}
					<label
						class="block w-full cursor-pointer rounded px-3 py-1.5 text-left hover:bg-white/10"
					>
						<span class="i-ph-file-plus mr-2" aria-hidden="true"></span>{midi && !midi.error
							? `Uploading MIDI ${Math.round(midi.percent)}%`
							: row.midiUrl
								? "Replace MIDI"
								: "Upload MIDI"}
						<input
							class="sr-only"
							type="file"
							accept={MIDI_ACCEPT}
							disabled={!!midi && !midi.error}
							onchange={(e) => uploadMidi(stem.id, e.currentTarget)}
						/>
					</label>
					{#if row.midiUrl}
						<form
							{...dropMidi.enhance(async ({ submit }) => {
								if (!confirm(`Remove the MIDI file for "${stem.label}"?`)) return;
								await submit();
							})}
						>
							<input {...dropMidi.fields.id.as("hidden", stem.id)} />
							<button
								class="block w-full rounded px-3 py-1.5 text-left hover:bg-white/10"
								disabled={!!dropMidi.pending}
							>
								<span class="i-ph-file-x mr-2" aria-hidden="true"></span>{dropMidi.pending
									? "Removing…"
									: "Remove MIDI"}
							</button>
						</form>
					{/if}
					{#if midi?.error}<p class="px-3 py-1 text-xs text-red-400">{midi.error}</p>{/if}
				{/if}
				{#if data.canEdit}
					<button
						class="block w-full rounded px-3 py-1.5 text-left hover:bg-white/10"
						type="button"
						onclick={() => rename(stem.id, stem.label)}
					>
						<span class="i-ph-pencil-simple mr-2" aria-hidden="true"></span>Rename
					</button>
					<label
						class="block w-full cursor-pointer rounded px-3 py-1.5 text-left hover:bg-white/10"
					>
						<span class="i-ph-upload-simple mr-2" aria-hidden="true"></span>{job
							? job.stage === "uploading"
								? `Uploading ${Math.round(job.percent)}%`
								: job.stage
							: "Upload new version"}
						<input
							class="sr-only"
							type="file"
							accept={STEM_ACCEPT}
							disabled={!!job}
							onchange={(e) => replaceStem(stem.id, e.currentTarget)}
						/>
					</label>
					<form
						{...remove.enhance(async ({ submit }) => {
							if (!confirm(`Remove "${stem.label}" and its file?`)) return;
							await submit();
						})}
					>
						<input {...remove.fields.id.as("hidden", stem.id)} />
						<button
							class="block w-full rounded px-3 py-1.5 text-left text-red-400 hover:bg-white/10"
							disabled={!!remove.pending}
						>
							<span class="i-ph-trash mr-2" aria-hidden="true"></span>{remove.pending
								? "Removing…"
								: "Remove"}
						</button>
					</form>
				{/if}
				{#if job?.error}<p class="px-3 py-1 text-xs text-red-400">{job.error}</p>{/if}
			</div>
		</details>
	{/if}
{/snippet}
