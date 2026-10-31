<script lang="ts">
	import { pageTitle } from "#lib/utils/pageTitle.js";
	import {
		DOC_HINTS,
		DOC_KINDS,
		DOC_LABELS,
		DOC_VIEWS,
		type PanelMode,
		SongDocs,
	} from "#lib/state/songDocs.svelte.js";
	import { MixUploads } from "#lib/state/mixUploads.svelte.js";
	import { SongChanges } from "#lib/state/songChanges.svelte.js";
	import { SongCheck } from "#lib/state/songCheck.svelte.js";
	import { SongSections } from "#lib/state/songSections.svelte.js";
	import { SongDetails } from "#lib/state/songDetails.svelte.js";
	import { DemoUploads } from "#lib/state/demoUploads.svelte.js";
	import SongSettingsPopover from "#lib/components/SongSettingsPopover.svelte";
	import SongActionsMenu from "#lib/components/SongActionsMenu.svelte";
	import SongCommentPopover from "#lib/components/SongCommentPopover.svelte";
	import SongCommentCard from "#lib/components/SongCommentCard.svelte";
	import CommentDeleteButton from "#lib/components/CommentDeleteButton.svelte";
	import { SongComments } from "#lib/state/songComments.svelte.js";
	import { SongDownloads } from "#lib/state/songDownloads.svelte.js";
	import { SongChordDraft } from "#lib/state/songChordDraft.svelte.js";
	import KeepOnDevice from "#lib/components/KeepOnDevice.svelte";
	import CommentTimeline from "#lib/components/CommentTimeline.svelte";
	import SongChat from "#lib/components/SongChat.svelte";
	import SongDocPanel from "#lib/components/SongDocPanel.svelte";
	import { chartDefaults } from "#lib/utils/chartDefaults.js";
	import { STAGE_LABEL, STAGE_PHASE } from "#lib/constants/songStages.js";
	import { songStage } from "#lib/utils/songStage.js";
	import ShareLinks from "#lib/components/ShareLinks.svelte";
	import MidiBadge from "#lib/components/MidiBadge.svelte";
	import StemMenu from "#lib/components/StemMenu.svelte";
	import StemVersionOffer from "#lib/components/StemVersionOffer.svelte";
	import { StemActions } from "#lib/state/stemActions.svelte.js";
	import StemPlayer from "#lib/components/StemPlayer.svelte";
	import PointerMenu from "#lib/components/PointerMenu.svelte";
	import DemoPanel from "#lib/components/DemoPanel.svelte";
	import MixList from "#lib/components/MixList.svelte";
	import SongFilesPanel from "#lib/components/SongFilesPanel.svelte";
	import SongNotationPanel from "#lib/components/SongNotationPanel.svelte";
	import DocHistoryPanel from "#lib/components/DocHistoryPanel.svelte";
	import type { SongDocSaveKind } from "#lib/val/SongDocKindSchema.js";
	import FloatingPanel from "#lib/components/FloatingPanel.svelte";
	import PracticeAmp from "#lib/components/PracticeAmp.svelte";
	import { amp } from "#lib/audio/amp.svelte.js";
	import { metronome } from "#lib/audio/metronome.svelte.js";
	import ContextMenu from "#lib/components/ContextMenu.svelte";
	import { type MidiSummary, parseMidi } from "#lib/audio/midi.js";
	import StemUploader, { type UploadJob } from "#lib/components/StemUploader.svelte";
	import { barGrid, formatPosition, secondsAtBar } from "#lib/audio/measures.js";
	import { formatDate } from "#lib/utils/formatDate.js";
	import { formatTime } from "#lib/utils/formatTime.js";
	import { dayText } from "#lib/utils/sessionName.js";
	import { unreadCount } from "#lib/utils/groupChat.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { copyShortLink } from "#lib/utils/copyShortLink.js";
	import { formatBytes } from "#lib/utils/formatBytes.js";
	import { artistLine } from "#lib/utils/artistLine.js";
	import type { CreditRole } from "#lib/val/CreditRoleSchema.js";
	import { formatMonth } from "#lib/utils/formatMonth.js";
	import { decodedStemBytes } from "#lib/utils/decodedStemBytes.js";
	import { SONG_CHANGE_KINDS } from "#lib/constants/songChanges.js";
	import { formatSongChange } from "#lib/utils/formatSongChange.js";
	import { keyLine } from "#lib/utils/keyLine.js";
	import type { StemEngine } from "#lib/audio/engine.svelte.js";
	import type { StemState } from "#lib/audio/types.js";

	import { DEMO_ACCEPT, DEMO_FORMAT_LIST } from "#lib/constants/demoFormats.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import { STEM_ACCEPT } from "#lib/constants/stemFormats.js";
	import {
		deleteStem,
		removeDemoById,
		saveChartDraft,
		saveSections,
		shareSong,
	} from "#lib/remote/songs.remote.js";
	import { afterNavigate, goto, refreshAll, replaceState } from "$app/navigation";
	import { page } from "$app/state";
	import { onDestroy, onMount, tick, type ComponentProps } from "svelte";

	let { data } = $props();

	// Song settings: a popover of tabs, each its own component; the song check moves it to Tempo & key.
	let settingsPopover = $state<SongSettingsPopover | null>(null);
	// Positions read and are typed in the readout's format (time, timecode or bars);
	// the form carries them as seconds, converted on the way in and out.
	let posCtx = $derived({
		fps: data.song.frameRate,
		grid: barGrid(data.song.changes, data.song.startAt),
	});
	/** The tempo, key and time signature rows (settings' Tempo & key tab), and the position helpers every editor shares. */
	const changes = new SongChanges({
		song: () => data.song,
		posCtx: () => posCtx,
		onsaved: refreshAll,
	});
	let mode = $derived(changes.mode);
	const showPos = (seconds: number) => formatPosition(mode, seconds, posCtx);
	/** The settings form (settings' Details tab): its entries, the start and end positions, and the credits. */
	const details = new SongDetails({ song: () => data.song, changes, onsaved: refreshAll });

	/** The per-stem actions (the row menu, the pending list, the order) and the stems-changed version offer. */
	const stemActions = new StemActions({ song: () => data.song, onsaved: refreshAll });

	/** Demo recordings, uploaded from settings, the Demos view and the stem actions menu. */
	const demos = new DemoUploads({ song: () => data.song, onuploaded: refreshAll });
	/** The Docs panel's Attachments tab; the Uploads menu and the panel's ⋯ menu open its picker. */
	let filesPanel = $state<SongFilesPanel | null>(null);

	// "Written by X, first written June 2019" under the title.
	// Shown in the song-info popover: the song's fixed tempo, key and meter, and its version.
	// The key names every key the song moves through ("C major (also A♭ major, F major)", a user's wording).
	let metaLine = $derived(
		SONG_CHANGE_KINDS.map((kind) =>
			kind === "key"
				? keyLine(data.song.changes)
				: (() => {
						const c = data.song.changes.find((x) => x.kind === kind);
						return c ? formatSongChange(c) : "";
					})(),
		)
			.filter((line) => line !== "")
			.join(" · "),
	);
	// Credits by role (song_credit rows with their artist).
	const creditsOf = (role: CreditRole) =>
		data.song.credits.filter((c) => c.role === role && c.artist).map((c) => c.artist.name);
	let performers = $derived(creditsOf("performer"));
	/** The artist line under the title: the performers, or the account's name when none is credited. */
	let artistName = $derived(artistLine(performers) || data.account.name);
	let composerLine = $derived(artistLine(creditsOf("composer")));
	let producerLine = $derived(artistLine(creditsOf("producer")));
	let writtenLine = $derived(
		[
			composerLine ? `Written by ${composerLine}` : "",
			producerLine ? `produced by ${producerLine}` : "",
			data.song.writtenOn ? `first written ${formatMonth(data.song.writtenOn)}` : "",
		]
			.filter(Boolean)
			.join(", "),
	);

	let readyDemos = $derived(data.song.demos.filter((d) => d.status === "ready" && d.url));
	/** While a demo's MP3 renders or its waveform is measured in the jobs function, the page refreshes itself (ten minutes at most). */
	let demosPending = $derived(
		readyDemos.some(
			(d) => d.playbackStatus !== "failed" && (d.playbackStatus !== "ready" || d.peaks === null),
		),
	);
	onMount(() => {
		let ticks = 0;
		const timer = setInterval(() => {
			if (++ticks > 120) return;
			if (demosPending && !demos.busy && !document.hidden) void refreshAll();
		}, 5000);
		return () => clearInterval(timer);
	});
	// The mixes view (docs/mixes.md): the song's mixes, the chosen one from ?mix= (a notification's or a share's link).
	let readyMixes = $derived(data.song.mixes.filter((m) => m.status === "ready" && m.url));
	const mixPath = (id: string) =>
		`/${data.account.slug}/projects/${data.song.project.slug}/${data.song.slug}/mixes/${id}`;
	let mixCommentCounts = $derived(
		data.mixComments.reduce(
			(m, c) => m.set(c.mixId, (m.get(c.mixId) ?? 0) + 1),
			new Map<string, number>(),
		),
	);
	/** Mixes uploaded from the Mixes view or the Uploads menu; the newest opens on its own page. */
	const mixUploads = new MixUploads({
		song: () => data.song,
		onuploaded: refreshAll,
		open: (id) => goto(mixPath(id)),
		showMixes: () => {
			if (playerMode === "minimised") togglePlayer();
			showView("mixes");
		},
	});
	/** An older link (?view=mixes&mix=<id>): the mix's own page now, else the Mixes view. */
	function openMixFromUrl() {
		const url = new URL(page.url.href);
		if (url.searchParams.get("view") !== "mixes") return;
		const id = url.searchParams.get("mix");
		if (id && data.song.mixes.some((m) => m.id === id)) {
			void goto(mixPath(id), { replaceState: true });
			return;
		}
		chosenView = "mixes";
		url.searchParams.delete("view");
		url.searchParams.delete("mix");
		replaceState(url, {});
	}
	// The demos view: the player's box shows either the stems or the demos.
	// Until the visitor picks, a song with stems opens on them and a song with
	// demos only on those; the visitor's pick sticks for the visit.
	let demoPanel = $state<DemoPanel | null>(null);
	/** A demo removed from its row's menu (Kevin): the file goes with it. */
	async function removeDemo(d: { id: string; label: string }) {
		if (!confirm(`Remove the demo "${d.label}"? The file is deleted.`)) return;
		try {
			await removeDemoById({ id: d.id });
			notify(`${d.label} removed`);
			await refreshAll();
		} catch (e) {
			notify(`Could not remove it: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	/** The stem player's box as last shown; the demos box is at least that tall (560 is the empty box's minimum). */
	let stemBoxHeight = $state(0);
	type PlayerView = "stems" | "demos" | "mixes";
	let chosenView = $state<PlayerView | null>(null);
	/** The song's stage (docs/mixes.md, "Phase 2"): set in settings, else read from what it holds. */
	let stage = $derived(
		songStage({
			stage: data.song.stage,
			isFinished: data.song.isFinished,
			hasMix: readyMixes.length > 0,
			hasStem: data.manifest.stems.length > 0,
		}),
	);
	// Until the visitor picks, the stage decides: mixing and finished open on the mixes, writing on the demos, arranging on the stems; a view with nothing in it gives way.
	let playerView = $derived.by<PlayerView>(() => {
		if (chosenView) return chosenView;
		const wanted: PlayerView[] =
			stage === "mixing" || stage === "finished"
				? ["mixes", "stems", "demos"]
				: stage === "writing"
					? ["demos", "stems", "mixes"]
					: ["stems", "mixes", "demos"];
		const has = (v: PlayerView) =>
			v === "stems"
				? data.manifest.stems.length > 0
				: v === "mixes"
					? readyMixes.length > 0
					: readyDemos.length > 0;
		return wanted.find(has) ?? "stems";
	});
	const PLAYER_VIEWS: PlayerView[] = ["stems", "demos", "mixes"];
	/** One thing plays at a time: switching views pauses the others. */
	function showView(view: PlayerView) {
		chosenView = view;
		if (view !== "stems") playerEngine?.pause();
		if (view !== "demos") demoPanel?.pause();
	}
	/** The Comments panel (docs/mixes.md, "Phase 2" sibling): closed until the Comments row's button opens it, or a comment notification's link (?open=comments). */
	let commentsOpen = $state(false);
	/** The Attachments panel (docs/uploads-and-blob.md): closed until the toolbar's button opens it; the Uploads menu opens it to pick. */
	let filesOpen = $state(false);
	/** The Practice Amp's panel (docs/practice-amp.md, "The band"): play along with the stems or a mix; off again on leaving the page. */
	let ampOpen = $state(false);
	onDestroy(() => void amp.setOn(false));
	/**
	 * The play-along transport in the amp panel's header (docs/practice-amp.md,
	 * "The band"): the stems from the top or where they are, with a bar of
	 * clicks first when Count in is on (the metronome, which the amp hosts),
	 * so the song and the guitar arrive together.
	 */
	let ampCountIn = $state(true);
	let ampCountingIn = $state(false);
	let ampCountTimer: ReturnType<typeof setTimeout> | null = null;
	async function ampPlay(fromStart: boolean) {
		const engine = playerEngine;
		if (!engine || engine.status !== "ready") return;
		if (engine.playing && !fromStart) {
			engine.pause();
			return;
		}
		if (fromStart) engine.seek(0);
		if (!ampCountIn) {
			await engine.play();
			return;
		}
		if (ampCountTimer) clearTimeout(ampCountTimer);
		metronome.load();
		ampCountingIn = true;
		await metronome.start();
		const bar = (60 / metronome.bpm) * metronome.beatsPerBar;
		ampCountTimer = setTimeout(() => {
			metronome.stop();
			ampCountingIn = false;
			ampCountTimer = null;
			void engine.play();
		}, bar * 1000);
	}
	function ampStop() {
		if (ampCountTimer) clearTimeout(ampCountTimer);
		ampCountTimer = null;
		if (ampCountingIn) metronome.stop();
		ampCountingIn = false;
		playerEngine?.pause();
	}
	// The chat (docs/chat.md) is its own panel, closed until the header's button opens it (Kevin: chat and read the docs at once).
	// Its messages and read mark live here so closing and reopening keeps them; SongChat binds to them.
	let chatOpen = $state(false);
	// svelte-ignore state_referenced_locally
	let chatMessages = $state(data.chat?.messages ?? []);
	// svelte-ignore state_referenced_locally
	let chatReadAt = $state<number | null>(data.chat?.readAt ?? null);
	/** A chat notification's link ends in ?open=chat (docs/chat.md): the panel opens and the query goes, so a reload does not reopen it. */
	function openChatFromUrl() {
		if (!data.chat || page.url.searchParams.get("open") !== "chat") return;
		chatOpen = true;
		const url = new URL(page.url.href);
		url.searchParams.delete("open");
		replaceState(url, {});
	}
	// A navigation from one song to another reuses this page: the chat starts over from the new song's.
	/** A comment notification's link ends in ?open=comments: the panel opens and the query goes. */
	function openCommentsFromUrl() {
		if (page.url.searchParams.get("open") !== "comments") return;
		commentsOpen = true;
		const url = new URL(page.url.href);
		url.searchParams.delete("open");
		replaceState(url, {});
	}
	afterNavigate(() => {
		chatMessages = data.chat?.messages ?? [];
		chatReadAt = data.chat?.readAt ?? null;
		openChatFromUrl();
		openCommentsFromUrl();
		openMixFromUrl();
		void openDemoFromUrl();
	});
	let chatUnread = $derived(
		data.chat ? unreadCount(chatMessages, chatReadAt, data.user?.id ?? null) : 0,
	);
	/** The tabs and the Attachments button carry their counts, as the player's Stems and Demos tabs do (Kevin): the attachments (the scores among them), the comments, and the Chart's uploads (notation files and attachments marked as notation), or 1 for chart text with no uploads. */
	let fileCount = $derived(
		data.song.files.filter((p) => p.status === "ready").length +
			data.song.notation.filter((n) => n.status === "ready").length,
	);
	let notationPdfs = $derived(data.song.files.filter((p) => p.status === "ready" && p.isNotation));
	let notationCount = $derived(
		data.song.notation.filter((n) => n.status === "ready").length + notationPdfs.length,
	);
	/**
	 * The player (the stems or the demos, with their tabs) the same way (Kevin):
	 * docked, floating from lg, or minimized to the action row's Player button,
	 * the panel kept mounted so decoded stems and playback survive; the button
	 * lights while it plays minimized. Remembered per browser.
	 */
	let playerMode = $state<PanelMode>("docked");
	let playerRestore: Exclude<PanelMode, "minimised"> = "docked";
	const PLAYER_MODE_KEY = "stemshovel.song.player-mode";
	function setPlayerMode(mode: PanelMode) {
		if (mode === "minimised" && playerMode !== "minimised") playerRestore = playerMode;
		playerMode = mode;
		try {
			localStorage.setItem(PLAYER_MODE_KEY, mode);
		} catch {
			// Private mode: the choice lasts for this page only.
		}
	}
	function togglePlayer() {
		setPlayerMode(playerMode === "minimised" ? playerRestore : "minimised");
	}
	/** The Attachments panel's picker, from the Uploads menu: the panel opened, then the picker. */
	async function pickFiles() {
		filesOpen = true;
		await tick();
		filesPanel?.pick();
	}
	/** The history panel's subject: a document (the project's or the user's own note) or a comment (docs/data-model.md). */
	let history = $state<
		| { kind: "doc"; songId: string; doc: SongDocSaveKind; label: string; current?: string }
		| { kind: "comment"; commentId: string; label: string }
		| null
	>(null);
	let historyRestorable = $derived.by(() => {
		if (history?.kind === "doc") return history.doc === "mynotes" || data.canEdit;
		if (history?.kind === "comment") {
			const id = history.commentId;
			const c = data.comments.find((x) => x.id === id);
			return !!c && (comments.canEdit(c) || comments.canDelete(c));
		}
		return false;
	});
	// Comments: who may do what, and the popover form (one popover, create or edit).
	const comments = new SongComments({
		user: () => data.user,
		memberships: () => data.memberships,
		accountId: () => data.account.id,
		readyDemos: () => readyDemos,
		editPos: (seconds) => changes.editPos(seconds),
	});
	/** The located comments, for the player's comment row. */
	let locatedComments = $derived(
		data.comments
			.filter((c) => c.at !== null)
			.map((c) => ({ id: c.id, title: c.title, at: c.at ?? 0 }))
			.sort((a, b) => a.at - b.at),
	);
	/** The ⌘-click menu on a demo's waveform: Seek here, Comment here. */
	let demoMenuAt = $state<{
		demo: { id: string; label: string };
		seconds: number;
		x: number;
		y: number;
	} | null>(null);
	/** A comment notification's link ends in ?demo=<id>: the Demos view opens on that demo, and the query goes. */
	async function openDemoFromUrl() {
		const url = new URL(page.url.href);
		const id = url.searchParams.get("demo");
		if (!id) return;
		url.searchParams.delete("demo");
		replaceState(url, {});
		if (!readyDemos.some((d) => d.id === id)) return;
		showView("demos");
		await tick();
		demoPanel?.show(id);
	}

	// Ctrl / ⌘-click (or right-click) on a waveform: a menu at the pointer (PointerMenu). The player
	// has its own for the stem rows, with "Seek here"; the page adds "Comment here" to it and keeps the
	// menus of the Comments row's mix waveform and of a demo's.
	type MenuItem = NonNullable<ComponentProps<typeof PointerMenu>["items"]>[number];
	const seekHere = (action: () => void): MenuItem => ({
		label: "Seek here",
		iconClass: "i-ph-skip-forward",
		action,
	});
	/** The comment form opens with the spot's position filled in. */
	const commentHere = (action: () => void): MenuItem => ({
		label: "Comment here",
		iconClass: "i-ph-hands-clapping-bold",
		action,
	});
	/** Where the Comments row's mix waveform was Ctrl / ⌘-clicked or right-clicked. */
	let mixMenuAt = $state<{ seconds: number; x: number; y: number } | null>(null);
	onMount(() => {
		docs.load();
		try {
			const pm = localStorage.getItem(PLAYER_MODE_KEY);
			if (pm === "docked" || pm === "floating" || pm === "minimised") playerMode = pm;
		} catch {
			// Private mode: docked.
		}
	});
	let pending = $derived(data.song.stems.filter((s) => s.status !== "ready"));
	let uploadJobs = $state<UploadJob[]>([]);
	/** Whichever uploader is on the page (the panel's or the menu's; they share the jobs), for "Retry failed". */
	let uploader = $state<StemUploader | null>(null);
	let uploadNotice = $state<string | null>(null);
	let ready = $derived(data.song.stems.filter((s) => s.status === "ready" && s.url));

	// The database row behind a player stem (filename, size, url).
	let stemRows = $derived(new Map(data.song.stems.map((s) => [s.id, s])));

	/** The song has a chart the AI can read with the mix: a score (MusicXML, or a PDF or image marked as notation) or its own chord chart document (docs/audio-engine.md, "The score as the AI's chart", "The chord chart as the AI's chart"). */
	let hasScore = $derived(notationCount > 0 || !!data.docs.chart);
	/** The model's chords ("D5 % A5 …") as chart lines, four bars each. */
	function aiChordLines(chords: string): string {
		const cells = chords.split(/\s+/).filter(Boolean);
		const lines: string[] = [];
		for (let i = 0; i < cells.length; i += 4)
			lines.push(`| ${cells.slice(i, i + 4).join(" | ")} |`);
		return lines.join("\n");
	}
	async function saveDraftSections() {
		const draft = chordDraft.draft;
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
			await refreshAll();
			sections.reset();
			notify("Sections saved from the draft");
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		}
	}
	async function saveDraftChart() {
		const draft = chordDraft.draft;
		if (!draft) return;
		const hasChart = !!data.docs.chart;
		if (hasChart && !confirm("Replace the song's chart with the drafted one?")) return;
		try {
			await saveChartDraft({ id: data.song.id, markdown: draft.chart, replace: hasChart });
			await refreshAll();
			notify("Chart saved from the draft");
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		}
	}
	/** The chart read opened for correction (docs/audio-engine.md, "The chart read is stored"): the Chart tab's notation view, then the first score's read. */
	async function reviewRead() {
		const file = notationPdfs[0];
		if (!file) return;
		await docs.showRead(file.id);
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

	// The player's engine, for the custom mix (the download row lives outside the player).
	let playerEngine = $state<StemEngine | null>(null);
	/** Detect chords and the AI's chart draft (the Tempo & key tab, the Docs panel's ⋯ menu and draft card). */
	const chordDraft = new SongChordDraft({
		songId: () => data.song.id,
		engine: () => playerEngine,
		grid: () => posCtx.grid,
		aiAvailable: () => data.aiAvailable,
	});
	/** The Docs panel: the document shown, its editor, the Chart's Text / Notation, the Notes' Mine, the panel's mode and ⋯ menu. */
	const docs = new SongDocs({
		song: () => data.song,
		docs: () => data.docs,
		myNote: () => data.myNote,
		signedIn: () => !!data.user,
		canEdit: () => data.canEdit,
		aiAvailable: () => data.aiAvailable,
		notationCount: () => notationCount,
		chordDraft: () => chordDraft,
		engineStatus: () => playerEngine?.status ?? null,
		hasGrid: () => !!posCtx.grid,
		onhistory: (target) => (history = target),
	});
	/** Scan stems, the uploader's detection and the AI's song check (the Tempo & key tab). */
	const check = new SongCheck({
		song: () => data.song,
		engine: () => playerEngine,
		aiAvailable: () => data.aiAvailable,
		hasScore: () => hasScore,
		changes,
		onsaved: refreshAll,
		showTab: () => settingsPopover?.showTab("tempo"),
	});
	/**
	 * The song's sections (settings' Sections tab): the rows, Detect and Place from chart. (The player
	 * can also offer "Add section at playhead" via its onaddsection prop; off for now.)
	 */
	const sections = new SongSections({
		song: () => data.song,
		grid: () => posCtx.grid,
		hasScore: () => hasScore,
		changes,
		alignChart: () => check.alignChart(),
		onsaved: refreshAll,
	});
	let player = $state<StemPlayer | null>(null);
	/** The "keep on this device" line for the status under the player's header (the player's own box is hidden); nothing until the player mounts. */
	const NO_KEEP = { available: false, kept: null, keeping: null, onkeep() {}, onremove() {} };
	let keepProps = $derived(player?.keepProps() ?? NO_KEEP);
	/** The song's default mix per stem; the faders start here for everyone. */
	let defaultGains = $derived(new Map(data.manifest.stems.map((s) => [s.id, s.gain ?? 1])));
	let defaultPans = $derived(new Map(data.manifest.stems.map((s) => [s.id, s.pan ?? 0])));
	/** A stem's fader or pan sits away from the song's default mix. */
	const stemDirty = (s: { id: string; gain: number; pan: number }) =>
		Math.abs(s.gain - (defaultGains.get(s.id) ?? 1)) > 1e-6 ||
		Math.abs(s.pan - (defaultPans.get(s.id) ?? 0)) > 1e-6;
	/** The listener moved something (fader, pan, mute, solo or master) away from the default mix. */
	let mixDirty = $derived(
		!!playerEngine &&
			(playerEngine.master !== 1 ||
				playerEngine.stems.some((s) => s.muted || s.soloed || stemDirty(s))),
	);
	/** The faders and pans alone differ from the default: there is a new default to save. */
	let fadersDirty = $derived(!!playerEngine && playerEngine.stems.some(stemDirty));
	/** The Downloads menu and the mix actions beside it (the stems zip, the MP3 mixes, Dawn, the default mix). */
	const downloads = new SongDownloads({
		song: () => data.song,
		ready: () => ready,
		engine: () => playerEngine,
		onmixsaved: async () => {
			player?.forgetLocalMix();
			await refreshAll();
		},
	});
</script>

<svelte:head>
	<title>{pageTitle(data.song.title)}</title>
</svelte:head>

<main
	class="page-x-padding pt-6 mb-2 grid grid-cols-1 xl-grid-cols-2 gap-8"
	data-song-id={data.song.id}
>
	<!-- 1. header: title, description, song settings -->
	<header class="grid gap-3 col-span-full">
		<div class="flex flex-wrap items-baseline justify-between gap-4">
			<!-- song header & metadata -->
			<div class="">
				<h1 class="app-page-heading">
					{#if data.song.isPrivate || data.song.project.isPrivate}
						<span
							class="i-ph-lock mr-1 inline-block align-[-2px] text-18px opacity-70"
							title="Private: members and viewing links only"
							aria-label="Private"
						></span>
					{/if}{data.song.title}
					<span class="text-14px">v{data.song.version}</span>
					{#if data.song.noAi || data.song.project.noAi}
						<span
							class="ml-2 inline-block rounded border border-white/20 px-1.5 py-0.5 align-middle text-10px uppercase tracking-wider opacity-70"
							title="No AI touches this song">no AI</span
						>{/if}<span
						class="ml-2 inline-block rounded border border-white/20 px-1.5 py-0.5 align-middle text-10px uppercase tracking-wider opacity-70"
						title={STAGE_PHASE[stage]}
						data-song-stage={stage}>{STAGE_LABEL[stage]}</span
					>
				</h1>

				<div class="flex flex-wrap gap-2 text-15px opacity-90">
					{#if artistName}
						<span aria-label="Artist">artist: {artistName}</span>
						<span>|</span>
					{/if}

					{#if data.account.name}
						<span
							>account: <a
								class="underline underline-offset-2"
								href="/{data.account.slug}/projects"
								aria-label="Account"
							>
								{data.account.name}</a
							></span
						>
						<span>|</span>
					{/if}

					<span class="opacity-90 text-15px"
						>a song in the <a
							class="underline underline-offset-2"
							href="/{data.account.slug}/projects/{data.song.project.slug}"
							>{data.song.project.name}</a
						>
						project</span
					>
				</div>
			</div>

			<!-- player, docs, comments, chat, attachments, share, info and settings -->
			<div class="flex flex-wrap justify-end gap-2">
				<!-- The Player and Docs panels: minimized to these buttons and back the way they were (Kevin, as the recorder's Ideas button); Player lit while it plays minimized. -->
				<button
					class="button button-sm {playerMode === 'minimised'
						? playerEngine?.playing
							? 'bg-blue-300/5 border-current/40 hover-border-accent text-accent'
							: 'bg-blue-300/5 border-current/40 hover-border-accent'
						: 'bg-accent text-oxford border-accent opacity-100'}"
					type="button"
					aria-pressed={playerMode !== "minimised"}
					title={playerMode === "minimised"
						? playerEngine?.playing
							? "The player is playing; show it"
							: "Show the player"
						: "Minimise the player"}
					aria-label={playerMode === "minimised" ? "Show the player" : "Minimise the player"}
					onclick={togglePlayer}
				>
					<span class="block i-ph-waveform" aria-hidden="true"></span>
				</button>
				<button
					class="button button-sm {docs.mode === 'minimised'
						? 'bg-blue-300/5 border-current/40 hover-border-accent'
						: 'bg-accent text-oxford border-accent opacity-100'}"
					type="button"
					aria-pressed={docs.mode !== "minimised"}
					title={docs.mode === "minimised" ? "Show the docs" : "Minimise the docs"}
					aria-label={docs.mode === "minimised" ? "Show the docs" : "Minimise the docs"}
					onclick={() => docs.toggle()}
				>
					<span class="block i-ph-files" aria-hidden="true"></span>
				</button>
				{#if data.chat}
					<!-- The chat panel's button (docs/chat.md): a dot while there is something unread. -->
					<button
						class="button button-sm bg-blue-300/5 border-current/40 hover-border-accent relative"
						type="button"
						title={chatUnread ? `Chat: ${chatUnread} new` : "Chat about this song"}
						aria-label="Chat{chatUnread ? ` (${chatUnread} new)` : ''}"
						aria-pressed={chatOpen}
						onclick={() => (chatOpen = !chatOpen)}
					>
						<span class="block i-ph-chat-circle-dots"></span>
						{#if chatUnread}
							<span
								class="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-oxford"
								aria-hidden="true"
								data-chat-unread
							></span>
						{/if}
					</button>
				{/if}
				<!-- The Comments panel's button: the count on the badge; the Comments row under the stems opens it too. -->
				<button
					class="button button-sm relative {commentsOpen
						? 'bg-accent text-oxford border-accent opacity-100'
						: 'bg-blue-300/5 border-current/40 hover-border-accent'}"
					type="button"
					aria-pressed={commentsOpen}
					title={commentsOpen ? "Close the comments" : "Show the comments"}
					aria-label="Comments{data.comments.length ? ` (${data.comments.length})` : ''}"
					onclick={() => (commentsOpen = !commentsOpen)}
				>
					<span class="block i-ph-hands-clapping-bold"></span>
					{#if data.comments.length}
						<span
							class="absolute -top-1.5 -right-1.5 min-w-4 rounded-full bg-oxford-800 px-1 text-center text-9px leading-4 text-light ring-1 ring-current/40"
							aria-hidden="true">{data.comments.length}</span
						>
					{/if}
				</button>
				<!-- The Attachments panel's button (Kevin): closed by default, lit while open, the file count on the badge. -->
				<button
					class="button button-sm relative {filesOpen
						? 'bg-accent text-oxford border-accent opacity-100'
						: 'bg-blue-300/5 border-current/40 hover-border-accent'}"
					type="button"
					aria-pressed={filesOpen}
					title={filesOpen ? "Close the attachments" : "Show the attachments"}
					aria-label="{filesOpen ? 'Close' : 'Show'} the attachments{fileCount
						? ` (${fileCount})`
						: ''}"
					onclick={() => (filesOpen = !filesOpen)}
				>
					<span class="block i-ph-paperclip"></span>
					{#if fileCount}
						<span
							class="absolute -top-1.5 -right-1.5 min-w-4 rounded-full bg-oxford-800 px-1 text-center text-9px leading-4 text-light ring-1 ring-current/40"
							aria-hidden="true">{fileCount}</span
						>
					{/if}
				</button>
				<!-- The Practice Amp's panel (docs/practice-amp.md): an instrument through the amp, alongside the song. -->
				<button
					class="button button-sm relative {ampOpen
						? 'bg-accent text-oxford border-accent opacity-100'
						: amp.on
							? 'bg-blue-300/5 border-current/40 text-accent'
							: 'bg-blue-300/5 border-current/40 hover-border-accent'}"
					type="button"
					aria-pressed={ampOpen}
					title={ampOpen ? "Close the practice amp" : "Play along through the practice amp"}
					aria-label={ampOpen ? "Close the practice amp" : "Practice amp"}
					onclick={() => (ampOpen = !ampOpen)}
				>
					<span class="block i-ph-speaker-high"></span>
				</button>
				<!-- The song's own address made short (docs/security.md "Short links"): the page without its query, so a viewing code never travels along. -->
				<button
					class="button button-sm bg-blue-300/5 border-current/40 hover-border-accent"
					type="button"
					title="Copy a short link to this song"
					aria-label="Copy a short link to this song"
					onclick={() => void copyShortLink(page.url.origin + page.url.pathname, "song")}
				>
					<span class="block i-ph-link"></span>
				</button>
				{#if data.canEdit}
					<button
						class="button button-sm bg-blue-300/5 border-current/40 hover-border-accent"
						type="button"
						popovertarget="song-share"
						title="Share this song by email"
						aria-label="Share this song by email"
					>
						<span class="block i-ph-paper-plane-tilt"></span>
					</button>
					<button
						class="button button-sm bg-blue-300/5 border-current/40 hover-border-accent"
						type="button"
						popovertarget="song-info"
						title="About this song"
						aria-label="About this song"
					>
						<span class="block i-ph-info"></span>
					</button>
					<button
						class="button button-sm bg-blue-300/5 border-current/40 hover-border-accent"
						type="button"
						popovertarget="song-settings"
						title="Song settings"
						aria-label="Song settings"
					>
						<span class="block i-ph-gear"></span>
					</button>
				{/if}
			</div>
		</div>
	</header>

	{#if data.canEdit}
		<SongSettingsPopover
			bind:this={settingsPopover}
			{details}
			{sections}
			{changes}
			{chordDraft}
			{check}
			{demos}
			song={data.song}
			artists={data.artists}
			accountSlug={data.account.slug}
			engine={playerEngine}
			grid={posCtx.grid}
			{hasScore}
			aiAvailable={data.aiAvailable}
			noAi={data.noAi}
			canEdit={data.canEdit}
			canReview={notationPdfs.length > 0 && data.canEdit}
			onreview={reviewRead}
			{stage}
			{draftCard}
		/>
	{/if}

	<!-- 2. player: transport + waveforms, with the stem actions -->
	<section
		class="grid grid-cols-1 place-content-start gap-y-5 {docs.mode === 'docked' &&
		playerMode === 'docked'
			? 'min-h-560px'
			: 'xl:col-span-2'}"
		aria-label="Player"
	>
		<!-- The box shows the stems or the demos; a song with demos but no stems opens on the demos.
		     The tabs always show (the Demos view holds Record Demo for a song without demos), in the panel's header.
		     The panel docks here, floats from lg, or is minimized to the action row's Player button (playerMode), kept mounted. -->
		<FloatingPanel
			open={playerMode !== "minimised"}
			floating={playerMode === "floating"}
			keep={true}
			title="Player"
			storageKey="stemshovel.song.player-panel"
			width={900}
			height={760}
			onminimise={() => setPlayerMode("minimised")}
		>
			{#snippet controls()}
				<div
					class="flex items-center overflow-hidden rounded border border-white/15"
					role="tablist"
					aria-label="Player view"
				>
					{#each PLAYER_VIEWS as view, index (view)}
						<button
							type="button"
							role="tab"
							aria-selected={playerView === view}
							class="{playerView === view
								? 'button button-xs bg-blue-300 text-oxford border-blue-300 hover-bg-blue-200 hover-border-blue-200'
								: 'button button-xs opacity-80 hover-bg-blue-200 hover-border-blue-200'} {index ===
							0
								? 'rounded-r-none border-r-none'
								: index === PLAYER_VIEWS.length - 1
									? 'rounded-l-none'
									: 'rounded-none border-r-none'}"
							onclick={() => showView(view)}
							>{view === "stems"
								? `Stems (${data.manifest.stems.length})`
								: view === "demos"
									? `Demos (${readyDemos.length})`
									: `Mixes (${readyMixes.length})`}</button
						>
					{/each}
				</div>
				<button
					class="button button-xs hidden lg-inline-flex"
					type="button"
					title={playerMode === "floating"
						? "Put the player back in its column"
						: "Pop the player out into a panel"}
					aria-label={playerMode === "floating" ? "Dock the player" : "Pop out the player"}
					onclick={() => setPlayerMode(playerMode === "floating" ? "docked" : "floating")}
				>
					<span
						class={playerMode === "floating" ? "i-ph-arrows-in-simple" : "i-ph-arrows-out-simple"}
						aria-hidden="true"
					></span>
				</button>
			{/snippet}
			{#if playerView === "demos"}
				<div>
					<DemoPanel
						bind:this={demoPanel}
						demos={readyDemos}
						minHeight={Math.max(560, stemBoxHeight)}
						canEdit={data.canEdit}
						onremove={removeDemo}
						comments={data.demoComments}
						canComment={data.canComment}
						card={demoCommentCard}
						oncomment={(d) => comments.open({ demoId: d.id })}
						oncontext={(d, seconds, x, y) => (demoMenuAt = { demo: d, seconds, x, y })}
					/>
					{#if data.sessionRecordings.length > 0}
						<!-- The session recordings the band tied to this song (docs/uploads-and-blob.md, "Sessions"): each opens on the Sessions page. -->
						<section
							class="mt-4 rounded-md border border-current/40 bg-blue/5 px-4 py-3"
							aria-label="Session recordings of this song"
						>
							<h3 class="mb-2 text-12px uppercase tracking-wider text-blue-300 opacity-90">
								From sessions ({data.sessionRecordings.length})
							</h3>
							<ul class="grid gap-1 text-14px">
								{#each data.sessionRecordings as r (r.id)}
									<li class="flex flex-wrap items-baseline gap-x-2">
										<a
											class="link-dim font-500"
											href="/{data.account.slug}/sessions?recording={r.id}"
											title="Open it on the Sessions page">{r.title}</a
										>
										{#if r.source}<span class="text-12px opacity-80">{r.source}</span>{/if}
										<span class="text-12px text-dim">{r.session} · {dayText(r.recordedOn)}</span>
									</li>
								{/each}
							</ul>
						</section>
					{/if}
				</div>
			{:else if playerView === "mixes"}
				<!-- The mixes (docs/mixes.md): a list; each opens on its own page to listen, comment and download. -->
				<div>
					<MixList
						bind:this={mixUploads.list}
						mixes={readyMixes}
						commentCounts={mixCommentCounts}
						hrefOf={mixPath}
						minHeight={Math.max(560, stemBoxHeight)}
						canEdit={data.canEdit}
						jobs={mixUploads.jobs}
						onfiles={(files) => void mixUploads.upload(files)}
					/>
				</div>
			{:else if data.manifest.stems.length > 0}
				<div bind:clientHeight={stemBoxHeight}>
					{#if playerEngine}
						<!-- The player's status, the body's first line (the player's own box is hidden; the header has no room beside the views and the controls). -->
						<p class="mb-2 text-13px opacity-70" aria-live="polite">
							{#if playerEngine.status === "loading"}
								Decoding stem {Math.min(playerEngine.loaded + 1, playerEngine.total)} of {playerEngine.total}…
							{:else if playerEngine.status === "ready"}
								{data.manifest.stems.length}
								{data.manifest.stems.length === 1 ? "stem" : "stems"},
								{#if playerEngine.mode === "streamed"}
									streamed{#if playerEngine.buffering}, buffering…{:else}
										<span class="i-ph-check text-green-300 align-[-2px]"></span>{/if}
									<button
										class="link ml-1"
										type="button"
										title="Decode every stem into memory instead: instant seeking, about 60 MB per four-minute stereo stem"
										onclick={() => player?.switchMode("buffered")}>play buffered</button
									>
								{:else}
									{formatBytes(playerEngine.decodedBytes)} decoded
									<span class="i-ph-check text-green-300 align-[-2px]"></span>
									{#if typeof AudioDecoder !== "undefined"}
										<button
											class="link ml-1"
											type="button"
											title="Decode a window around the playhead instead of the whole song, so a song of any size fits"
											onclick={() => player?.switchMode("streamed")}>stream</button
										>
									{/if}
								{/if}
								<KeepOnDevice {...keepProps} />
							{/if}
						</p>
					{/if}
					{#if (stage === "mixing" || stage === "finished") && readyMixes.length > 0}
						<!-- The stems are from an earlier stage (docs/mixes.md, "Phase 2"); the studio recording is in Mixes. -->
						<p
							class="mb-3 rounded border border-current/20 bg-blue-300/5 px-3 py-2 text-13px opacity-90"
						>
							These stems are from the arranging stage. The studio recording is in
							<button type="button" class="link-dim" onclick={() => showView("mixes")}>Mixes</button
							>.
						</p>
					{/if}
					<StemPlayer
						manifest={data.manifest}
						streaming={data.stemStreaming}
						showStatus={false}
						{stemMenu}
						{stemBadge}
						{midiViews}
						sections={data.song.sections}
						changes={data.song.changes}
						startAt={data.song.startAt}
						endAt={data.song.endAt}
						fps={data.song.frameRate}
						onengine={(e) => (playerEngine = e)}
						contextItems={(_stem, seconds) =>
							data.canEdit
								? [commentHere(() => comments.open({ at: changes.editPos(seconds) }))]
								: []}
						{afterRows}
						songId={data.song.id}
						onreorder={data.canEdit ? stemActions.saveOrder : undefined}
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
					class="grid min-h-560px place-content-center rounded-md border border-current/40 bg-blue/5 px-4 py-3 text-center"
				>
					<p class="text-sm text-dim">No stems yet.</p>
					{#if data.canEdit}
						<p class="mt-1 text-sm opacity-80">
							Upload stems, start with a demo recording of the idea, or record one now.
						</p>
						<div class="mt-4 flex flex-wrap items-center justify-center gap-3">
							<StemUploader
								bind:this={uploader}
								songId={data.song.id}
								stemCount={data.song.stems.length}
								decodedBytes={decodedStemBytes(data.song.stems)}
								bind:jobs={uploadJobs}
								bind:notice={uploadNotice}
								onuploaded={stemActions.offer}
								onanalysis={check.applyDetection}
								label="Upload stems"
								class="inline-flex items-center gap-2"
							/>
							<label
								class="button button-sm inline-flex cursor-pointer items-center gap-2 {demos.busy
									? 'pointer-events-none opacity-50'
									: ''}"
								title="Phone memos, rough takes, the original idea ({DEMO_FORMAT_LIST})"
							>
								<span class="i-ph-microphone" aria-hidden="true"></span>
								{demos.busy ? "Uploading…" : "Upload a demo"}
								<input
									class="sr-only"
									type="file"
									accept={DEMO_ACCEPT}
									multiple
									disabled={demos.busy}
									onchange={(e) => demos.upload(e.currentTarget)}
								/>
							</label>
							<a
								class="button button-sm inline-flex items-center gap-2"
								href="/idea-recorder?song={data.song.id}"
								title="Idea recorder: record a riff, a melody or a demo for this song"
							>
								<span class="i-ph-record-fill text-red-500" aria-hidden="true"></span>
								Record a demo
							</a>
						</div>
					{/if}
				</div>
			{/if}
		</FloatingPanel>

		<SongActionsMenu
			{downloads}
			{demos}
			{check}
			song={data.song}
			docs={data.docs}
			canEdit={data.canEdit}
			engine={playerEngine}
			{ready}
			{readyDemos}
			mixBusy={mixUploads.busy}
			{mixDirty}
			{fadersDirty}
			bind:jobs={uploadJobs}
			bind:notice={uploadNotice}
			bind:uploader
			onuploaded={stemActions.offer}
			onpickmix={() => void mixUploads.pick()}
			onpickfiles={() => void pickFiles()}
			onpicknotation={() => void docs.pickNotation()}
			onshowdemos={() => showView("demos")}
			onresetmix={() => player?.resetMix()}
		/>

		<StemVersionOffer actions={stemActions} version={data.song.version} canEdit={data.canEdit} />
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
								class="h-full {job.status === 'error' ? 'bg-red-400' : 'bg-accent'}"
								style:width="{job.percent}%"
							></div>
						</div>
						{#if job.error}<p class="mt-1 text-xs text-red-400">{job.error}</p>{/if}
					</li>
				{/each}
			</ul>
			{#if uploadJobs.some((j) => j.status === "error") && !uploadJobs.some((j) => j.status === "uploading" || j.status === "decoding")}
				<div class="px-4 py-2">
					<button
						class="button button-xs"
						type="button"
						title="Upload the files that failed again, to the same stems"
						onclick={() => uploader?.retryFailed()}
					>
						<span class="i-ph-arrow-clockwise" aria-hidden="true"></span>
						Retry failed
					</button>
				</div>
			{/if}
		{/if}

		{#if pending.length > 0}
			<ul class="mt-4 surface divide-y divide-white/10 text-sm" aria-label="Stems not ready">
				{#each pending as stem (stem.id)}
					{@const job = stemActions.replacing[stem.id]}
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
										onchange={(e) => stemActions.replace(stem.id, e.currentTarget)}
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

	<!-- 3. the Docs panel: chart, lyrics, notes, comments and PDFs (Kevin). Docked in this column, floating from lg, or minimized to the action row's Docs button (docs.mode); its tabs and menus in the panel's header. Away from the column the player takes both. -->
	<section
		class="{docs.mode === 'docked'
			? `h-full min-h-560px ${playerMode === 'docked' ? '' : 'xl:col-span-2'}`
			: docs.mode === 'floating'
				? 'xl:col-span-2 xl:h-0 xl:min-h-0'
				: 'hidden'} max-w-full"
		aria-label="Chart, lyrics, notes, comments and PDFs"
	>
		<FloatingPanel
			open={docs.mode !== "minimised"}
			floating={docs.mode === "floating"}
			title="Docs"
			storageKey="stemshovel.song.docs-panel"
			width={640}
			height={720}
			extraClass="h-full"
			onminimise={() => void docs.setMode("minimised")}
		>
			{#snippet controls()}
				<!-- A dropdown on a phone, the segmented control from sm up. -->
				<ContextMenu
					ariaLabel="Document"
					buttonBaseClasses="button button-xs sm:hidden"
					iconClass="i-ph-caret-down"
					label={docs.tabLabel(docs.panel)}
					position="bottom left"
					items={DOC_KINDS.map((kind) => ({
						id: kind,
						label: docs.tabLabel(kind),
						iconClass: docs.panel === kind ? "i-ph-check" : "i-ph-check invisible",
						action: () => docs.show(kind),
					}))}
				/>
				<div
					class="hidden shrink-0 overflow-hidden rounded border border-white/15 items-center sm:flex"
					role="tablist"
					aria-label="Document"
				>
					{#each DOC_KINDS as kind, index (kind)}
						<button
							type="button"
							role="tab"
							aria-selected={docs.panel === kind}
							class="{docs.panel === kind
								? 'button button-xs bg-blue-300 text-oxford border-blue-300 hover-bg-blue-200 hover-border-blue-200'
								: 'button button-xs opacity-80 hover-bg-blue-200 hover-border-blue-200'} inline-flex items-center min-h-7 {index ===
							0
								? 'rounded-r-none border-r-none'
								: index === DOC_KINDS.length - 1
									? 'rounded-l-none'
									: 'rounded-none border-r-none'}"
							onclick={() => docs.show(kind)}>{docs.tabLabel(kind)}</button
						>
					{/each}
				</div>
				<div class="flex items-stretch gap-2 {data.canEdit || docs.notesMine ? '' : 'hidden'}">
					{#if docs.notationShown}
						<button
							class="button button-xs flex items-center"
							type="button"
							title="Upload notation: MusicXML files"
							aria-label="Upload notation"
							onclick={() => docs.notation?.pick()}
						>
							<span class="i-ph-plus"></span>
						</button>
					{:else}
						<button
							class="button button-xs flex items-center {docs.editing
								? 'bg-blue-300 text-oxford border-blue-300'
								: ''}"
							type="button"
							title={docs.editing
								? `Done editing ${docs.notesMine ? "your notes" : `the ${docs.doc}`}`
								: `Edit ${docs.notesMine ? "your notes" : `the ${docs.doc}`} here`}
							aria-label={docs.editing
								? `Done editing ${docs.notesMine ? "your notes" : `the ${docs.doc}`}`
								: `Edit ${docs.notesMine ? "your notes" : `the ${docs.doc}`}`}
							aria-pressed={docs.editing}
							onclick={async () => {
								if (docs.editing) await docs.editor?.close();
								else docs.editing = true;
							}}
						>
							<span
								class={docs.editing
									? docs.saving
										? "i-ph-circle-notch animate-spin"
										: "i-ph-check"
									: (docs.notesMine ? docs.myNote.html : data.docs[docs.doc])
										? "i-ph-pencil"
										: "i-ph-plus"}
							></span>
						</button>
					{/if}
					<ContextMenu
						ariaLabel="{DOC_LABELS[docs.panel]} menu"
						title="More"
						buttonBaseClasses="button button-xs"
						iconClass={chordDraft.draftBusy || chordDraft.chordBusy
							? "i-ph-circle-notch animate-spin"
							: "i-ph-dots-three-outline-vertical-fill"}
						position="bottom left"
						items={docs.menuItems}
					/>
				</div>
				<button
					class="button button-xs hidden lg-inline-flex"
					type="button"
					title={docs.mode === "floating"
						? "Put the docs back in their column"
						: "Pop the docs out into a panel"}
					aria-label={docs.mode === "floating" ? "Dock the docs" : "Pop out the docs"}
					onclick={() => void docs.setMode(docs.mode === "floating" ? "docked" : "floating")}
				>
					<span
						class={docs.mode === "floating" ? "i-ph-arrows-in-simple" : "i-ph-arrows-out-simple"}
						aria-hidden="true"
					></span>
				</button>
			{/snippet}
			{#if docs.panel === "chart" || (docs.panel === "notes" && docs.canHaveNote) || docs.editing}
				<!-- Stuck to the panel's top right: the editor's pane while a document is edited, Text / Notation on the Chart tab, Project / Mine on the Notes tab (Kevin). -->
				<div
					class="sticky top-0 z-10 flex items-start justify-end gap-2 h-0 overflow-visible pointer-events-none"
				>
					{#if docs.editing && !docs.notationShown}
						<div
							class="pointer-events-auto flex overflow-hidden rounded border border-white/15 bg-oxford/95 shadow-md shadow-black/40"
							role="radiogroup"
							aria-label="Editor view"
						>
							{#each DOC_VIEWS as v, index (v.id)}
								<button
									type="button"
									role="radio"
									aria-checked={docs.view === v.id}
									class="{docs.view === v.id
										? 'button button-xs bg-blue-300 text-oxford border-blue-300 hover-bg-blue-200 hover-border-blue-200'
										: 'button button-xs opacity-80 hover-bg-blue-200 hover-border-blue-200'} {index ===
									0
										? 'rounded-r-none border-r-none'
										: 'rounded-l-none'}"
									onclick={() => (docs.view = v.id)}>{v.name}</button
								>
							{/each}
						</div>
					{/if}
					{#if docs.panel === "notes" && docs.canHaveNote}
						<div
							class="pointer-events-auto flex overflow-hidden rounded border border-white/15 bg-oxford/95 shadow-md shadow-black/40"
							role="radiogroup"
							aria-label="Whose notes"
						>
							{#each [{ id: false, label: "Project" }, { id: true, label: "Mine" }] as m, index (m.label)}
								<button
									type="button"
									role="radio"
									aria-checked={docs.notesChoice === m.id}
									title={m.id
										? "A private note of your own on this song"
										: "The notes everyone on the project sees"}
									class="{docs.notesChoice === m.id
										? 'button button-xs bg-blue-300 text-oxford border-blue-300 hover-bg-blue-200 hover-border-blue-200'
										: 'button button-xs opacity-80 hover-bg-blue-200 hover-border-blue-200'} {index ===
									0
										? 'rounded-r-none border-r-none'
										: 'rounded-l-none'}"
									onclick={() => void docs.setNotesMine(m.id)}>{m.label}</button
								>
							{/each}
						</div>
					{/if}
					{#if docs.panel === "chart"}
						<div
							class="pointer-events-auto flex overflow-hidden rounded border border-white/15 bg-oxford/95 shadow-md shadow-black/40"
							role="radiogroup"
							aria-label="Chart mode"
						>
							{#each [{ id: "text", label: "Text" }, { id: "notation", label: `Notation (${notationCount})` }] as m, index (m.id)}
								<button
									type="button"
									role="radio"
									aria-checked={docs.chartMode === m.id}
									class="{docs.chartMode === m.id
										? 'button button-xs bg-blue-300 text-oxford border-blue-300 hover-bg-blue-200 hover-border-blue-200'
										: 'button button-xs opacity-80 hover-bg-blue-200 hover-border-blue-200'} {index ===
									0
										? 'rounded-r-none border-r-none'
										: 'rounded-l-none'}"
									onclick={() => void docs.setChartMode(m.id as "text" | "notation")}
									>{m.label}</button
								>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
			{#if docs.notationShown}
				<!-- The notation files (docs/uploads-and-blob.md, "Notation"): MusicXML engraved in the browser. -->
				<SongNotationPanel
					bind:this={docs.notation}
					songId={data.song.id}
					songTitle={data.song.title}
					notation={data.song.notation}
					pdfs={notationPdfs}
					canEdit={data.canEdit}
					aiAvailable={data.aiAvailable && !data.song.noAi && !data.song.project.noAi}
					oncheck={() => void check.askAiWithScore()}
				/>
			{:else if docs.notesMine}
				<!-- The user's private note: the same editor, saved as kind "mynotes" to the user's own row (docs/data-model.md). -->
				{#key `mynotes:${docs.myNote.version}`}
					<SongDocPanel
						bind:this={docs.editor}
						songId={data.song.id}
						kind="mynotes"
						label="My notes"
						hint="Your own notepad for this song. Nobody else sees it."
						markdown={docs.myNote.markdown}
						html={docs.myNote.html}
						version={docs.myNote.version}
						canEdit={true}
						bind:editing={docs.editing}
						view={docs.view}
						mono={docs.mono.notes}
					/>
				{/key}
			{:else}
				{#key docs.doc}
					<SongDocPanel
						bind:this={docs.editor}
						songId={data.song.id}
						kind={docs.doc}
						label={DOC_LABELS[docs.doc]}
						hint={DOC_HINTS[docs.doc]}
						markdown={docs.text}
						html={data.docs[docs.doc]}
						version={docs.version}
						canEdit={data.canEdit}
						bind:editing={docs.editing}
						view={docs.view}
						mono={docs.mono[docs.doc]}
						above={docs.panel === "chart" ? draftInPanel : undefined}
						chartDefaults={chartDefaults(data.song.changes)}
					/>
				{/key}
			{/if}
		</FloatingPanel>
		<DocHistoryPanel
			target={history}
			canRestore={historyRestorable}
			onclose={() => (history = null)}
			onrestored={() => refreshAll()}
		/>
	</section>
	<!-- The comments (docs/data-model.md "comment"): a panel of their own, opened from the Comments row's button under the stems; the list as the Docs tab had it. -->
	<div class="{commentsOpen ? '' : 'hidden'} max-w-full lg:contents">
		<FloatingPanel
			open={commentsOpen}
			title="Comments"
			storageKey="stemshovel.song.comments-panel"
			width={520}
			height={640}
			onminimise={() => (commentsOpen = false)}
		>
			{#snippet controls()}
				{#if data.canComment}
					<button
						class="button button-xs flex items-center"
						type="button"
						title="Add a comment"
						aria-label="Add a comment"
						onclick={() => comments.open()}
					>
						<span class="i-ph-plus"></span>
					</button>
				{/if}
			{/snippet}
			<div
				class="h-full min-h-full bg-blue-300/5 border rounded-md border-current/40 px-6 pt-6 pb-8"
			>
				{#if data.comments.length === 0}
					<p class="opacity-80">No comments yet.</p>
				{:else}
					<ol class="grid gap-4">
						{#each data.comments as c (c.id)}
							<li
								class="rounded-md border border-white/10 bg-black/20 px-4 py-3"
								id="comment-{c.id}"
							>
								<div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
									<h3 class="font-600">{c.title}</h3>
									<span class="text-12px opacity-70">
										{c.authorName} · {formatDate(c.createdAt)}
										{#if c.editedAt}<button
												type="button"
												class="ml-1 rounded border border-current/30 px-1 text-9px uppercase tracking-wider hover:border-current/70"
												title="Edited {formatDate(c.editedAt)}: see the earlier versions"
												onclick={() =>
													(history = { kind: "comment", commentId: c.id, label: `“${c.title}”` })}
												>edited</button
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
								{#if comments.canEdit(c) || comments.canDelete(c)}
									<div class="mt-2 flex gap-3 text-12px">
										{#if comments.canEdit(c)}
											<button type="button" class="link-dim" onclick={() => comments.edit(c)}
												>Edit</button
											>
										{/if}
										{#if comments.canDelete(c)}
											<CommentDeleteButton id={c.id} title={c.title} key={c.id} />
										{/if}
									</div>
								{/if}
							</li>
						{/each}
					</ol>
				{/if}
			</div>
		</FloatingPanel>
	</div>
	{#if data.chat}
		<!-- The chat (docs/chat.md): its own panel, closed until the header's button opens it; floats from lg, a block under the docs below (`contents` keeps it out of the grid from lg). -->
		<div class="{chatOpen ? '' : 'hidden'} max-w-full lg:contents">
			<FloatingPanel
				open={chatOpen}
				title="Chat"
				storageKey="stemshovel.song.chat-panel"
				width={440}
				height={600}
				onminimise={() => (chatOpen = false)}
			>
				<SongChat
					songId={data.song.id}
					bind:messages={chatMessages}
					bind:readAt={chatReadAt}
					me={data.user ? { id: data.user.id, name: data.user.name } : null}
					isAdmin={comments.isAdmin}
					canWrite={data.canComment}
					onseek={(s) => playerEngine?.seek(s)}
				/>
			</FloatingPanel>
		</div>
	{/if}
	<!-- The attachments (docs/uploads-and-blob.md, "Attachments"): every file of the song, the scores among them, in a panel of their own, closed until the toolbar's button opens it (Kevin). -->
	<div class="{filesOpen ? '' : 'hidden'} max-w-full lg:contents">
		<FloatingPanel
			open={filesOpen}
			title="Attachments"
			storageKey="stemshovel.song.files-panel"
			width={600}
			height={640}
			onminimise={() => (filesOpen = false)}
		>
			{#snippet controls()}
				{#if data.canEdit}
					<button
						class="button button-xs flex items-center"
						type="button"
						title="Upload attachments: PDFs, images, audio, text, MIDI"
						aria-label="Upload attachments"
						onclick={() => filesPanel?.pick()}
					>
						<span class="i-ph-plus"></span>
					</button>
				{/if}
			{/snippet}
			<SongFilesPanel
				bind:this={filesPanel}
				songId={data.song.id}
				songTitle={data.song.title}
				files={data.song.files}
				scores={data.song.notation}
				canEdit={data.canEdit}
				onnotation={async (files) => {
					await docs.uploadNotation(files);
				}}
			/>
		</FloatingPanel>
	</div>
	<div class="{ampOpen ? '' : 'hidden'} max-w-full lg:contents">
		<FloatingPanel
			open={ampOpen}
			title="Practice amp"
			storageKey="stemshovel.song.amp-panel"
			width={900}
			height={600}
			onminimise={() => (ampOpen = false)}
		>
			{#snippet controls()}
				<!-- The play-along transport: the stems, with a count-in from the metronome. -->
				<div class="flex items-center gap-1 text-12px" role="group" aria-label="Play along">
					<button
						class="button button-xs flex items-center gap-1"
						type="button"
						disabled={!playerEngine || playerEngine.status !== "ready"}
						title={playerEngine?.playing ? "Pause the song" : "Play the song along with the amp"}
						aria-label={playerEngine?.playing || ampCountingIn ? "Pause the song" : "Play the song"}
						onclick={() =>
							playerEngine?.playing || ampCountingIn ? ampStop() : void ampPlay(false)}
					>
						<span
							class={ampCountingIn
								? "i-ph-metronome"
								: playerEngine?.playing
									? "i-ph-pause"
									: "i-ph-play"}
							aria-hidden="true"
						></span>
						{ampCountingIn ? "Count-in…" : playerEngine?.playing ? "Pause" : "Play"}
					</button>
					<button
						class="button button-xs flex items-center"
						type="button"
						disabled={!playerEngine || playerEngine.status !== "ready"}
						title="From the top, with the count-in"
						aria-label="Play the song from the top"
						onclick={() => void ampPlay(true)}
					>
						<span class="i-ph-skip-back" aria-hidden="true"></span>
					</button>
					<label
						class="flex items-center gap-1 px-1"
						title="A bar of clicks before the song starts"
					>
						<input type="checkbox" class="accent-maximumYellow" bind:checked={ampCountIn} />
						Count in
					</label>
				</div>
			{/snippet}
			<div class="p-2">
				<PracticeAmp
					sitePresets={data.ampSitePresets}
					account={data.ampAccount}
					presets={data.ampPresets}
					presetAdmin={data.presetAdmin}
				/>
			</div>
		</FloatingPanel>
	</div>
</main>

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
			Add a description, credits, tempo, key and time signature in song settings.
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
				isPrivate={data.song.isPrivate || data.song.project.isPrivate}
			/>
		</div>
	</div>
{/if}

{#if data.canEdit}
	<SongCommentPopover
		{comments}
		songId={data.song.id}
		{changes}
		engine={playerEngine}
		{demoPanel}
		onposted={() => (commentsOpen = true)}
	/>
{/if}

{#snippet demoCommentCard(id: string)}
	{@const c = data.demoComments.find((x) => x.id === id)}
	{#if c}<SongCommentCard
			comment={c}
			{comments}
			list="demo"
			pos={(s) => formatTime(s, 1)}
			onseek={(s) => demoPanel?.seekTo(s)}
			onedit={() => comments.editDemo(c)}
		/>{/if}
{/snippet}

<!-- Ctrl / ⌘-click menu on a demo's waveform, at the pointer -->
<PointerMenu
	at={demoMenuAt}
	items={demoMenuAt
		? [
				{
					kind: "notice",
					notice: `${demoMenuAt.demo.label} · ${formatTime(demoMenuAt.seconds, 1)}`,
				},
				seekHere(() => demoPanel?.seekTo(demoMenuAt?.seconds ?? 0)),
				...(data.canComment
					? [
							commentHere(() =>
								comments.open({
									at: formatTime(demoMenuAt?.seconds ?? 0, 2),
									demoId: demoMenuAt?.demo.id ?? "",
								}),
							),
						]
					: []),
			]
		: []}
	ariaLabel="Actions at this spot in the demo"
/>

<!-- Ctrl / ⌘-click menu on the Comments row's mix waveform, at the pointer (the stem rows' is the player's own) -->
<PointerMenu
	at={mixMenuAt}
	items={mixMenuAt
		? [
				{ kind: "notice", notice: `Mix · ${showPos(mixMenuAt.seconds)}` },
				seekHere(() => playerEngine?.seek(mixMenuAt?.seconds ?? 0)),
				...(data.canEdit
					? [commentHere(() => comments.open({ at: changes.editPos(mixMenuAt?.seconds ?? 0) }))]
					: []),
			]
		: []}
	ariaLabel="Actions at this spot in the mix"
/>

{#snippet commentCard(id: string)}
	{@const c = data.comments.find((x) => x.id === id)}
	{#if c}<SongCommentCard
			comment={c}
			{comments}
			list="timeline"
			pos={showPos}
			onseek={(s) => playerEngine?.seek(s)}
			onedit={() => comments.edit(c)}
		/>{/if}
{/snippet}

{#snippet draftCard()}
	{#if chordDraft.draft}
		<div class="mt-2 rounded bg-white/5 px-3 py-2 text-sm">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<span class="font-600">AI draft</span>
				<span class="flex items-center gap-3">
					<button class="link-dim" type="button" onclick={saveDraftSections}>Save sections</button>
					<button class="link-dim" type="button" onclick={saveDraftChart}>Save as chart</button>
					<button class="link-dim" type="button" onclick={() => (chordDraft.draft = null)}
						>Discard</button
					>
				</span>
			</div>
			{#if chordDraft.draft.chords.trim()}
				<details class="mt-2 text-12px">
					<summary class="cursor-pointer text-dim">Chords by bar</summary>
					<pre class="mt-1 whitespace-pre-wrap font-mono opacity-90">{aiChordLines(
							chordDraft.draft.chords,
						)}</pre>
				</details>
			{/if}
			<p class="mt-1 text-13px">
				<!-- Unkeyed on purpose: a draft is replaced whole, and section names repeat (two verses). -->
				{#each chordDraft.draft.sections as sec, i}{i > 0 ? " · " : ""}{sec.index}
					{sec.name} @ bar {sec.bar}{/each}
			</p>
			<ul class="mt-1 text-13px opacity-90">
				{#each chordDraft.draft.progressions as pr}
					<li><span class="font-600">{pr.section}:</span> {pr.chords}</li>
				{/each}
			</ul>
			{#if chordDraft.draft.notes}<p class="mt-1 text-12px text-dim">
					{chordDraft.draft.notes}
				</p>{/if}
			<!-- The suggested chart as it would look once saved (the panel's chart-body typography). -->
			<article class="mt-3 chart-body rounded-md border border-current/40 bg-blue-300/5 px-6 py-6">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized server-side in renderMarkdown -->
				{@html chordDraft.draft.chartHtml}
			</article>
			<details class="mt-1 text-12px">
				<summary class="cursor-pointer text-dim">Chart markdown</summary>
				<pre class="mt-1 whitespace-pre-wrap rounded bg-black/20 p-2 opacity-90">{chordDraft.draft
						.chart}</pre>
			</details>
		</div>
	{/if}
{/snippet}

{#snippet draftInPanel()}
	{#if chordDraft.chordError}<p class="mb-4 text-sm text-red-400" role="alert">
			{chordDraft.chordError}
		</p>{/if}
	{#if chordDraft.draft}
		<div class="mb-6">{@render draftCard()}</div>
	{/if}
{/snippet}

{#snippet afterRows()}
	<!-- Members always see the row, so they learn comments exist; visitors only when there are some. -->
	{#if playerEngine && (locatedComments.length > 0 || data.canComment)}
		<CommentTimeline
			engine={playerEngine}
			comments={locatedComments}
			card={commentCard}
			canComment={data.canComment}
			count={data.comments.length}
			onopen={() => (commentsOpen = !commentsOpen)}
			oncontext={(seconds, x, y) => (mixMenuAt = { seconds, x, y })}
		/>
	{/if}
	<!-- The player's tips under the rows, as the instruments wear them (Kevin: the comment gesture is not obvious). -->
	{#if playerEngine}
		<div
			aria-label="Player tips"
			class="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-12px text-light [&_kbd]-(inline-block rounded border border-current/40 px-1.5 py-px font-mono text-11px leading-tight)"
		>
			<span><kbd>Space</kbd> play / pause</span>
			<span><kbd>Home</kbd> to the start</span>
			<span>click a waveform to jump there</span>
			{#if data.canComment}
				<span
					><kbd>⌘</kbd>-click, <kbd>Ctrl</kbd>-click or right-click a waveform to leave a comment
					there</span
				>
			{/if}
		</div>
	{/if}
{/snippet}

{#snippet stemBadge(stem: StemState)}
	{#if stemRows.get(stem.id)?.midiUrl}
		<MidiBadge active={!!midiViews[stem.id]} onclick={() => toggleMidiView(stem.id)} />
	{/if}
{/snippet}

{#snippet stemMenu(stem: StemState)}
	<StemMenu {stem} row={stemRows.get(stem.id)} actions={stemActions} canEdit={data.canEdit} />
{/snippet}
