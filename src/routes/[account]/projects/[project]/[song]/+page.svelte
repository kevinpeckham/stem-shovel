<script lang="ts">
	import { pageTitle } from "#lib/utils/pageTitle.js";
	import {
		DOC_HINTS,
		DOC_KINDS,
		DOC_LABELS,
		DOC_VIEWS,
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
	import { SongComments } from "#lib/state/songComments.svelte.js";
	import { SongDownloads } from "#lib/state/songDownloads.svelte.js";
	import { SongChordDraft } from "#lib/state/songChordDraft.svelte.js";
	import SongPlayerTabs from "#lib/components/SongPlayerTabs.svelte";
	import SongPlayerStatus from "#lib/components/SongPlayerStatus.svelte";
	import SongEmptyPlayer from "#lib/components/SongEmptyPlayer.svelte";
	import StemUploadList from "#lib/components/StemUploadList.svelte";
	import PendingStems from "#lib/components/PendingStems.svelte";
	import SongSessionRecordings from "#lib/components/SongSessionRecordings.svelte";
	import { SongPlayerLayout } from "#lib/state/songPlayerLayout.svelte.js";
	import { StemUploads } from "#lib/state/stemUploads.svelte.js";
	import { SongMix } from "#lib/state/songMix.svelte.js";
	import CommentTimeline from "#lib/components/CommentTimeline.svelte";
	import SongChatPanel from "#lib/components/SongChatPanel.svelte";
	import SongCommentsPanel from "#lib/components/SongCommentsPanel.svelte";
	import SongAttachmentsPanel from "#lib/components/SongAttachmentsPanel.svelte";
	import SongPointerMenus from "#lib/components/SongPointerMenus.svelte";
	import { SongChat } from "#lib/state/songChat.svelte.js";
	import { SongHistory } from "#lib/state/songHistory.svelte.js";
	import {
		SongPointerMenus as PointerMenus,
		commentHere,
	} from "#lib/state/songPointerMenus.svelte.js";
	import ChartHtml from "#lib/components/ChartHtml.svelte";
	import SongDocPanel from "#lib/components/SongDocPanel.svelte";
	import { chartDefaults } from "#lib/utils/chartDefaults.js";
	import { STAGE_LABEL, STAGE_PHASE } from "#lib/constants/songStages.js";
	import { songStage } from "#lib/utils/songStage.js";
	import MidiBadge from "#lib/components/MidiBadge.svelte";
	import StemMenu from "#lib/components/StemMenu.svelte";
	import StemVersionOffer from "#lib/components/StemVersionOffer.svelte";
	import { StemActions } from "#lib/state/stemActions.svelte.js";
	import StemPlayer from "#lib/components/StemPlayer.svelte";
	import DemoPanel from "#lib/components/DemoPanel.svelte";
	import MixList from "#lib/components/MixList.svelte";
	import SongNotationPanel from "#lib/components/SongNotationPanel.svelte";
	import DocHistoryPanel from "#lib/components/DocHistoryPanel.svelte";
	import FloatingPanel from "#lib/components/FloatingPanel.svelte";
	import SongAmpPanel from "#lib/components/SongAmpPanel.svelte";
	import SongInfoPopover from "#lib/components/SongInfoPopover.svelte";
	import SongSharePopover from "#lib/components/SongSharePopover.svelte";
	import { SongAmp } from "#lib/state/songAmp.svelte.js";
	import { MidiViews } from "#lib/state/midiViews.svelte.js";
	import { amp } from "#lib/audio/amp.svelte.js";
	import { metronome } from "#lib/audio/metronome.svelte.js";
	import ContextMenu from "#lib/components/ContextMenu.svelte";
	import { barGrid, formatPosition, secondsAtBar } from "#lib/audio/measures.js";
	import { formatTime } from "#lib/utils/formatTime.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { copyShortLink } from "#lib/utils/copyShortLink.js";
	import { artistLine } from "#lib/utils/artistLine.js";
	import type { CreditRole } from "#lib/val/CreditRoleSchema.js";
	import type { StemEngine } from "#lib/audio/engine.svelte.js";
	import type { StemState } from "#lib/audio/types.js";

	import { errorMessage } from "#lib/utils/errorMessage.js";
	import { saveChartDraft, saveSections } from "#lib/remote/songs.remote.js";
	import { afterNavigate, goto, refreshAll, replaceState } from "$app/navigation";
	import { page } from "$app/state";
	import { onDestroy, onMount, tick } from "svelte";

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
	let attachments = $state<SongAttachmentsPanel | null>(null);

	// Credits by role (song_credit rows with their artist); the song-info popover spells the rest out itself.
	const creditsOf = (role: CreditRole) =>
		data.song.credits.filter((c) => c.role === role && c.artist).map((c) => c.artist.name);
	let performers = $derived(creditsOf("performer"));
	/** The artist line under the title: the performers, or the account's name when none is credited. */
	let artistName = $derived(artistLine(performers) || data.account.name);

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
			if (layout.mode === "minimised") layout.toggle();
			layout.show("mixes");
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
		layout.chosenView = "mixes";
		url.searchParams.delete("view");
		url.searchParams.delete("mix");
		replaceState(url, {});
	}
	// The demos view: the player's box shows either the stems or the demos.
	// Until the visitor picks, a song with stems opens on them and a song with
	// demos only on those; the visitor's pick sticks for the visit.
	let demoPanel = $state<DemoPanel | null>(null);
	/** The song's stage (docs/mixes.md, "Phase 2"): set in settings, else read from what it holds. */
	let stage = $derived(
		songStage({
			stage: data.song.stage,
			isFinished: data.song.isFinished,
			hasMix: readyMixes.length > 0,
			hasStem: data.manifest.stems.length > 0,
		}),
	);
	/** The player's layout (docked, floating or minimized, remembered per browser) and which view it shows: the stems, the demos or the mixes. */
	const layout = new SongPlayerLayout({
		stage: () => stage,
		stemCount: () => data.manifest.stems.length,
		demoCount: () => readyDemos.length,
		mixCount: () => readyMixes.length,
		engine: () => playerEngine,
		demoPanel: () => demoPanel,
	});
	/** The Comments panel (docs/mixes.md, "Phase 2" sibling): closed until the Comments row's button opens it, or a comment notification's link (?open=comments). */
	let commentsOpen = $state(false);
	/** The Attachments panel (docs/uploads-and-blob.md): closed until the toolbar's button opens it; the Uploads menu opens it to pick. */
	let filesOpen = $state(false);
	/** The Practice Amp's panel (docs/practice-amp.md, "The band"): play along with the stems or a mix; off again on leaving the page. */
	/** The Practice Amp's panel and its play-along transport (docs/practice-amp.md, "The band"); the amp itself is off again on leaving the page. */
	const songAmp = new SongAmp({ engine: () => playerEngine });
	onDestroy(() => {
		void amp.setOn(false);
		songAmp.dispose();
	});
	/** The chat (docs/chat.md): its panel, messages and read mark. */
	// svelte-ignore state_referenced_locally
	const chat = new SongChat(data.chat, () => data.user?.id ?? null);
	/** A chat notification's link ends in ?open=chat (docs/chat.md): the panel opens and the query goes, so a reload does not reopen it. */
	function openChatFromUrl() {
		if (!data.chat || page.url.searchParams.get("open") !== "chat") return;
		chat.open = true;
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
		chat.reset(data.chat);
		openChatFromUrl();
		openCommentsFromUrl();
		openMixFromUrl();
		void openDemoFromUrl();
	});
	/** The tabs and the Attachments button carry their counts, as the player's Stems and Demos tabs do (Kevin): the attachments (the scores among them), the comments, and the Chart's uploads (notation files and attachments marked as notation), or 1 for chart text with no uploads. */
	let fileCount = $derived(
		data.song.files.filter((p) => p.status === "ready").length +
			data.song.notation.filter((n) => n.status === "ready").length,
	);
	let notationPdfs = $derived(data.song.files.filter((p) => p.status === "ready" && p.isNotation));
	let notationCount = $derived(
		data.song.notation.filter((n) => n.status === "ready").length + notationPdfs.length,
	);
	/** The history panel: which document or comment it shows, and whether this user may restore a version. */
	const history = new SongHistory({
		canEdit: () => data.canEdit,
		comments: () => data.comments,
		canEditComment: (c) => comments.canEdit(c),
		canDeleteComment: (c) => comments.canDelete(c),
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
	/** A comment notification's link ends in ?demo=<id>: the Demos view opens on that demo, and the query goes. */
	async function openDemoFromUrl() {
		const url = new URL(page.url.href);
		const id = url.searchParams.get("demo");
		if (!id) return;
		url.searchParams.delete("demo");
		replaceState(url, {});
		if (!readyDemos.some((d) => d.id === id)) return;
		layout.show("demos");
		await tick();
		demoPanel?.show(id);
	}

	/** The menus at the pointer on a demo's waveform and on the Comments row's mix (SongPointerMenus). */
	const pointerMenus = new PointerMenus();
	onMount(() => {
		docs.load();
		layout.load();
	});
	let pending = $derived(data.song.stems.filter((s) => s.status !== "ready"));
	/** The stem uploads in flight (the panel's or the menu's uploader; they share the jobs) and the notice under the player. */
	const uploads = new StemUploads();
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
				sections: draft.sections.map((s) => ({ name: s.name, start: secondsAtBar(grid, s.bar) })),
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
	/** A stem's MIDI file drawn under its row when its badge is on. */
	const midi = new MidiViews();
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
		onhistory: (target) => history.open(target),
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
	/** The listener's mix against the song's default: anything moved, and whether the faders alone make a new default to save. */
	const mix = new SongMix({ manifest: () => data.manifest, engine: () => playerEngine });
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
					class="button button-sm {layout.mode === 'minimised'
						? playerEngine?.playing
							? 'bg-blue-300/5 border-current/40 hover-border-accent text-accent'
							: 'bg-blue-300/5 border-current/40 hover-border-accent'
						: 'bg-accent text-oxford border-accent opacity-100'}"
					type="button"
					aria-pressed={layout.mode !== "minimised"}
					title={layout.mode === "minimised"
						? playerEngine?.playing
							? "The player is playing; show it"
							: "Show the player"
						: "Minimise the player"}
					aria-label={layout.mode === "minimised" ? "Show the player" : "Minimise the player"}
					onclick={() => layout.toggle()}
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
						title={chat.unread ? `Chat: ${chat.unread} new` : "Chat about this song"}
						aria-label="Chat{chat.unread ? ` (${chat.unread} new)` : ''}"
						aria-pressed={chat.open}
						onclick={() => chat.toggle()}
					>
						<span class="block i-ph-chat-circle-dots"></span>
						{#if chat.unread}
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
					class="button button-sm relative {songAmp.open
						? 'bg-accent text-oxford border-accent opacity-100'
						: amp.on
							? 'bg-blue-300/5 border-current/40 text-accent'
							: 'bg-blue-300/5 border-current/40 hover-border-accent'}"
					type="button"
					aria-pressed={songAmp.open}
					title={songAmp.open ? "Close the practice amp" : "Play along through the practice amp"}
					aria-label={songAmp.open ? "Close the practice amp" : "Practice amp"}
					onclick={() => songAmp.toggle()}
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
		layout.mode === 'docked'
			? 'min-h-560px'
			: 'xl:col-span-2'}"
		aria-label="Player"
	>
		<!-- The box shows the stems or the demos; a song with demos but no stems opens on the demos.
		     The tabs always show (the Demos view holds Record Demo for a song without demos), in the panel's header.
		     The panel docks here, floats from lg, or is minimized to the action row's Player button (layout.mode), kept mounted. -->
		<FloatingPanel
			open={layout.mode !== "minimised"}
			floating={layout.mode === "floating"}
			keep={true}
			title="Player"
			storageKey="stemshovel.song.player-panel"
			width={900}
			height={760}
			onminimise={() => layout.setMode("minimised")}
		>
			{#snippet controls()}
				<SongPlayerTabs
					{layout}
					stemCount={data.manifest.stems.length}
					demoCount={readyDemos.length}
					mixCount={readyMixes.length}
				/>
			{/snippet}
			{#if layout.view === "demos"}
				<div>
					<DemoPanel
						bind:this={demoPanel}
						demos={readyDemos}
						minHeight={Math.max(560, layout.stemBoxHeight)}
						canEdit={data.canEdit}
						onremove={(d) => demos.remove(d)}
						comments={data.demoComments}
						canComment={data.canComment}
						card={demoCommentCard}
						oncomment={(d) => comments.open({ demoId: d.id })}
						oncontext={(d, seconds, x, y) => pointerMenus.openDemo(d, seconds, x, y)}
					/>
					<SongSessionRecordings
						recordings={data.sessionRecordings}
						accountSlug={data.account.slug}
					/>
				</div>
			{:else if layout.view === "mixes"}
				<!-- The mixes (docs/mixes.md): a list; each opens on its own page to listen, comment and download. -->
				<div>
					<MixList
						bind:this={mixUploads.list}
						mixes={readyMixes}
						commentCounts={mixCommentCounts}
						hrefOf={mixPath}
						minHeight={Math.max(560, layout.stemBoxHeight)}
						canEdit={data.canEdit}
						jobs={mixUploads.jobs}
						onfiles={(files) => void mixUploads.upload(files)}
					/>
				</div>
			{:else if data.manifest.stems.length > 0}
				<div bind:clientHeight={layout.stemBoxHeight}>
					<SongPlayerStatus
						engine={playerEngine}
						stemCount={data.manifest.stems.length}
						{keepProps}
						onmode={(m) => player?.switchMode(m)}
						showStageNotice={(stage === "mixing" || stage === "finished") && readyMixes.length > 0}
						onshowmixes={() => layout.show("mixes")}
					/>
					<StemPlayer
						manifest={data.manifest}
						streaming={data.stemStreaming}
						showStatus={false}
						{stemMenu}
						{stemBadge}
						midiViews={midi.views}
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
				<SongEmptyPlayer
					songId={data.song.id}
					stems={data.song.stems}
					canEdit={data.canEdit}
					{uploads}
					{demos}
					onuploaded={stemActions.offer}
					onanalysis={check.applyDetection}
				/>
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
			mixDirty={mix.dirty}
			fadersDirty={mix.fadersDirty}
			bind:jobs={uploads.jobs}
			bind:notice={uploads.notice}
			bind:uploader={uploads.uploader}
			onuploaded={stemActions.offer}
			onpickmix={() => void mixUploads.pick()}
			onpickfiles={() => void attachments?.pick()}
			onpicknotation={() => void docs.pickNotation()}
			onshowdemos={() => layout.show("demos")}
			onresetmix={() => player?.resetMix()}
		/>

		<StemVersionOffer actions={stemActions} version={data.song.version} canEdit={data.canEdit} />
		<StemUploadList {uploads} />
		<PendingStems {pending} actions={stemActions} canEdit={data.canEdit} />
	</section>

	<!-- 3. the Docs panel: chart, lyrics, notes, comments and PDFs (Kevin). Docked in this column, floating from lg, or minimized to the action row's Docs button (docs.mode); its tabs and menus in the panel's header. Away from the column the player takes both. -->
	<section
		class="{docs.mode === 'docked'
			? `h-full min-h-560px ${layout.mode === 'docked' ? '' : 'xl:col-span-2'}`
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
				<!-- Stuck to the panel's top right: the editor's pane while a document is edited, Chords / Engraving on the Chart tab, Project / Mine on the Notes tab (Kevin). -->
				<div
					class="sticky top-0 z-10 flex items-start justify-end gap-2 h-0 overflow-visible pointer-events-none"
				>
					{#if docs.editing && !docs.notationShown && docs.panel !== "chart"}
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
							{#each [{ id: "text", label: "Chords" }, { id: "notation", label: `Engraving (${notationCount})` }] as m, index (m.id)}
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
						{#if docs.chartMode === "text"}
							<!-- How the Chords view spells chords: a syntax choice within chords, so a menu on the view (Kevin). -->
							<div class="pointer-events-auto rounded shadow-md shadow-black/40">
								<ContextMenu
									ariaLabel="Chord spelling: {docs.chordDialectShort}"
									title="Chord spelling"
									buttonBaseClasses="button button-xs gap-1 border-white/15 bg-oxford/95 opacity-80 hover-opacity-100"
									iconClass="i-ph-list-numbers"
									label={docs.chordDialectShort}
									items={docs.chordDialectItems}
								/>
							</div>
							<!-- Transposition is a view-level key choice, like the spelling (Kevin, 2026-11-02): the chart text stays as written. -->
							<div class="pointer-events-auto rounded shadow-md shadow-black/40">
								<ContextMenu
									ariaLabel="Key: {docs.chartKey.label(data.song.chartMarkdown)}"
									title="Key: the chart drawn in another key (a viewing choice; the chart itself does not change)"
									buttonBaseClasses="button button-xs gap-1 border-white/15 bg-oxford/95 opacity-80 hover-opacity-100"
									iconClass="i-ph-music-note"
									label={docs.chartKey.label(data.song.chartMarkdown)}
									items={docs.chartKey.items(data.song.chartMarkdown)}
								/>
							</div>
						{/if}
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
					chartDefaults={chartDefaults(data.song.changes)}
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
						numerals={docs.numerals}
						chartText={docs.chartKey.text(data.song.chartMarkdown)}
					/>
				{/key}
			{/if}
		</FloatingPanel>
		<DocHistoryPanel
			target={history.target}
			canRestore={history.restorable}
			onclose={() => history.close()}
			onrestored={() => refreshAll()}
		/>
	</section>
	<SongCommentsPanel
		bind:open={commentsOpen}
		{comments}
		list={data.comments}
		canComment={data.canComment}
		engine={playerEngine}
		{showPos}
		onhistory={(t) => history.open(t)}
	/>
	{#if data.chat}
		<SongChatPanel
			{chat}
			songId={data.song.id}
			me={data.user ? { id: data.user.id, name: data.user.name } : null}
			isAdmin={comments.isAdmin}
			canWrite={data.canComment}
			onseek={(s) => playerEngine?.seek(s)}
		/>
	{/if}
	<SongAttachmentsPanel
		bind:this={attachments}
		bind:open={filesOpen}
		songId={data.song.id}
		songTitle={data.song.title}
		files={data.song.files}
		scores={data.song.notation}
		canEdit={data.canEdit}
		onnotation={async (files) => {
			await docs.uploadNotation(files);
		}}
	/>
</main>
<SongInfoPopover
	song={data.song}
	account={data.account}
	readyCount={ready.length}
	canEdit={data.canEdit}
/>
{#if data.canEdit}
	<SongSharePopover song={data.song} shareLinks={data.shareLinks} />
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
<SongPointerMenus
	menus={pointerMenus}
	{demoPanel}
	engine={playerEngine}
	{comments}
	editPos={(s) => changes.editPos(s)}
	canComment={data.canComment}
	canEdit={data.canEdit}
	{showPos}
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
				{#each chordDraft.draft.sections as sec, i}{i > 0 ? " · " : ""}{sec.name} @ bar {sec.bar}{/each}
			</p>
			<ul class="mt-1 text-13px opacity-90">
				{#each chordDraft.draft.progressions as pr}
					<li><span class="font-600">{pr.section}:</span> {pr.chords}</li>
				{/each}
			</ul>
			{#if chordDraft.draft.notes}<p class="mt-1 text-12px text-dim">
					{chordDraft.draft.notes}
				</p>{/if}
			<!-- The suggested chart as it would look once saved. -->
			<article class="mt-3 chart-body rounded-md border border-current/40 bg-blue-300/5 px-6 py-6">
				<ChartHtml html={chordDraft.draft.chartHtml} />
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
			oncontext={(seconds, x, y) => pointerMenus.openMix(seconds, x, y)}
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
		<MidiBadge
			active={!!midi.views[stem.id]}
			onclick={() => void midi.toggle(stem.id, stemRows.get(stem.id)?.midiUrl ?? undefined)}
		/>
	{/if}
{/snippet}

{#snippet stemMenu(stem: StemState)}
	<StemMenu {stem} row={stemRows.get(stem.id)} actions={stemActions} canEdit={data.canEdit} />
{/snippet}
