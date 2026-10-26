<script lang="ts">
	import { afterNavigate, goto, invalidateAll, replaceState } from "$app/navigation";
	import { page } from "$app/state";
	import ComboBox from "#lib/components/ComboBox.svelte";
	import ContextMenu from "#lib/components/ContextMenu.svelte";
	import FloatingPanel from "#lib/components/FloatingPanel.svelte";
	import PageCopyHeader from "#lib/components/PageCopyHeader.svelte";
	import RecordingReview from "#lib/components/RecordingReview.svelte";
	import SessionDeviceSelect from "#lib/components/SessionDeviceSelect.svelte";
	import SessionPlayer, { type SessionTrack } from "#lib/components/SessionPlayer.svelte";
	import ShareLinks from "#lib/components/ShareLinks.svelte";
	import SongChat from "#lib/components/SongChat.svelte";
	import { DEMO_ACCEPT } from "#lib/constants/demoFormats.js";
	import {
		SESSION_DEVICE_LABELS,
		SESSION_KIND_LABELS,
		SESSION_KINDS,
		SESSION_MAX_BYTES,
		type SessionKind,
	} from "#lib/constants/sessionRecordings.js";
	import { chatSince } from "#lib/remote/chat.remote.js";
	import {
		createSessionComment,
		deleteSessionComment,
		updateSessionComment,
	} from "#lib/remote/sessionComments.remote.js";
	import {
		createSession,
		deleteRecording,
		deleteSession,
		saveSessionEq,
		updateRecording,
		updateSession,
	} from "#lib/remote/sessions.remote.js";
	import type { ChatMessageRow, SessionCommentRow } from "#lib/server/data.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { postJson, saveAs, uploadSessionFile, type SessionReservation } from "#lib/upload.js";
	import { downloadBuilt } from "#lib/utils/downloadBuilt.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import { formatBytes } from "#lib/utils/formatBytes.js";
	import { formatDate } from "#lib/utils/formatDate.js";
	import { formatTime } from "#lib/utils/formatTime.js";
	import { unreadCount } from "#lib/utils/groupChat.js";
	import { dayFitsSession, localDay } from "#lib/utils/isoDay.js";
	import { pageTitle } from "#lib/utils/pageTitle.js";
	import { recordingDownloadName } from "#lib/utils/recordingDownloadName.js";
	import { recordingInputText } from "#lib/utils/recordingInputText.js";
	import type { SessionDevice } from "#lib/val/SessionRecordingSchema.js";
	import { dayText, sessionDisplayName } from "#lib/utils/sessionName.js";
	import { onMount, tick } from "svelte";

	/**
	 * The Sessions page (docs/uploads-and-blob.md, "Sessions"): the band's
	 * practices and shows with their recordings, the player, the uploads
	 * and the edits; and the review: each recording's waveform with
	 * comments on it (RecordingReview, the page's card and popover), a
	 * chat per session (SongChat in a panel), and a search over sessions,
	 * recordings and comments.
	 */
	let { data } = $props();

	type Session = (typeof data.sessions)[number];
	type Recording = Session["recordings"][number];

	const nameOf = (s: Session) => sessionDisplayName(s);
	const titleOf = (r: Recording) => r.title || r.filename;
	/** What plays: the MP3 once rendered, else the file as uploaded (which not every browser can play). */
	const urlOf = (r: Recording) => r.playbackUrl ?? r.url;
	const tracksOf = (s: Session): SessionTrack[] =>
		s.recordings.map((r) => ({
			id: r.id,
			title: titleOf(r),
			url: urlOf(r),
			session: nameOf(s),
			sessionId: s.id,
			sessionEq: s.eq,
		}));
	/** A session that runs into the next day: any recording of the day after. */
	const nextDayOf = (s: Session) =>
		s.recordings.map((r) => r.recordedOn).find((d) => d !== s.startsOn) ?? null;
	const totalBytes = (s: Session) => s.recordings.reduce((n, r) => n + r.sizeBytes, 0);
	const mp3sReady = (s: Session) => s.recordings.filter((r) => r.playbackStatus === "ready").length;

	// ── The player: one queue, a session's recordings in the order they were made ──
	let player = $state<SessionPlayer | null>(null);
	let queue = $state<SessionTrack[]>([]);
	let current = $state<string | null>(null);
	let paused = $state(true);
	let playerTime = $state(0);
	let playerDuration = $state(0);
	let playerLoop = $state<{ start: number; end: number } | null>(null);
	let playerLooping = $state(false);
	/** The player lives in a floating panel (docked in the flow below lg), hidden until a track starts; its close button collapses it to the toolbar's Player button. */
	let playerOpen = $state(false);
	const currentTitle = $derived(queue.find((t) => t.id === current)?.title ?? "");
	/** Every start goes through here, so the panel shows the moment something plays. */
	async function startTrack(id: string) {
		playerOpen = true;
		await player?.play(id);
	}
	async function playRecording(s: Session, r: Recording) {
		if (!queue.some((t) => t.id === r.id)) queue = tracksOf(s);
		await startTrack(r.id);
	}
	function playSession(s: Session) {
		if (s.recordings.length === 0) return;
		queue = tracksOf(s);
		void startTrack(s.recordings[0]!.id);
	}
	/** After an edit or a delete, the queue follows the list (a renamed track, a gone one). */
	function refreshQueue() {
		const all = new Map(data.sessions.flatMap((s) => tracksOf(s).map((t) => [t.id, t] as const)));
		queue = queue.flatMap((t) => (all.has(t.id) ? [all.get(t.id)!] : []));
		if (current && !all.has(current)) {
			current = null;
			paused = true;
			playerOpen = false;
		}
	}

	// ── Upload ──
	let kind = $state<SessionKind>("practice");
	let place = $state("");
	/** Where the batch was captured ("Room mic"), the same for every file picked (Kevin: one performance from several devices). */
	let source = $state("");
	/** The kind of device the batch was captured on, the same for every file picked; "" for unset. */
	let device = $state<SessionDevice>("");
	/** "auto": each file's own day picks (or makes) the session; else a session's id. */
	let intoSession = $state("auto");
	const sessionOptions = $derived([
		{
			value: "auto",
			label: "By each file's date",
			description: "the session of that day, or a new one",
		},
		...data.sessions.slice(0, 40).map((s) => ({
			value: s.id,
			label: nameOf(s),
			description: `${SESSION_KIND_LABELS[s.kind]} · ${dayText(s.startsOn)}`,
		})),
	]);
	let jobs = $state<{ name: string; percent: number; error?: string }[]>([]);
	let busy = $state(false);
	/** The "Add a recording" popover, closed once files are picked so the rows and the progress show on the page. */
	let addPanel = $state<HTMLElement | null>(null);
	function closeAddPanel() {
		try {
			addPanel?.hidePopover();
		} catch {
			// Already closed.
		}
	}
	async function uploadPicked(input: HTMLInputElement) {
		const picked = [...(input.files ?? [])];
		input.value = "";
		if (picked.length === 0) return;
		closeAddPanel();
		busy = true;
		jobs = picked.map((f) => ({ name: f.name, percent: 0 }));
		for (const [i, file] of picked.entries()) {
			if (file.size > SESSION_MAX_BYTES) {
				jobs[i].error = `Over ${formatBytes(SESSION_MAX_BYTES)}`;
				continue;
			}
			try {
				await uploadSessionFile(
					file,
					() =>
						postJson<SessionReservation>("/api/sessions", {
							accountId: data.account.id,
							sessionId: intoSession === "auto" ? undefined : intoSession,
							source,
							device,
							kind,
							// The file's own day (the recorder's clock), not the upload's.
							recordedOn: localDay(new Date(file.lastModified || Date.now())),
							place,
							filename: file.name,
							sizeBytes: file.size,
						}),
					(percent) => (jobs[i].percent = percent),
				);
			} catch (e) {
				jobs[i].error = errorMessage(e);
			}
		}
		await invalidateAll();
		busy = false;
		if (jobs.every((j) => !j.error)) {
			notify(
				picked.length === 1
					? "Recording uploaded; its MP3 is on the way"
					: `${picked.length} recordings uploaded; their MP3s are on the way`,
			);
			jobs = [];
		}
	}

	// ── While an MP3 renders or a waveform is measured in the jobs function, the list refreshes itself (for ten minutes at most) ──
	const pending = $derived(
		data.sessions
			.flatMap((s) => s.recordings)
			.some(
				(r) => r.playbackStatus !== "failed" && (r.playbackStatus !== "ready" || r.peaks === null),
			),
	);
	onMount(() => {
		let ticks = 0;
		const timer = setInterval(() => {
			if (++ticks > 120) return;
			if (pending && !busy && !editingSession && !editingRecording && !document.hidden)
				void invalidateAll();
		}, 5000);
		return () => clearInterval(timer);
	});

	// ── Browse: the kind, and a search over sessions, recordings and comments (as the Ideas page's) ──
	let filter = $state<"all" | SessionKind>("all");
	let searchText = $state("");
	const query = $derived(searchText.trim().toLowerCase());
	const has = (text: string | null | undefined) => !!text && text.toLowerCase().includes(query);
	const recordingMatches = (r: Recording) =>
		has(r.title) ||
		has(r.filename) ||
		has(r.notes) ||
		has(recordingInputText(r.device, r.source)) ||
		has(r.song?.title) ||
		has(r.uploader?.name) ||
		has(dayText(r.recordedOn)) ||
		commentsOf(r).some((c) => has(c.title) || has(c.body));
	const sessionMatches = (s: Session) =>
		has(nameOf(s)) ||
		has(s.place) ||
		has(s.notes) ||
		has(SESSION_KIND_LABELS[s.kind]) ||
		has(dayText(s.startsOn));
	const byKind = $derived(
		filter === "all" ? data.sessions : data.sessions.filter((s) => s.kind === filter),
	);
	const shown = $derived(
		query ? byKind.filter((s) => sessionMatches(s) || s.recordings.some(recordingMatches)) : byKind,
	);
	/** A session found by its own words shows every recording; one found through a recording shows the ones that matched. */
	const recordingsShown = (s: Session) =>
		query && !sessionMatches(s) ? s.recordings.filter(recordingMatches) : s.recordings;

	// ── The review: comments on a recording, under its row (docs/uploads-and-blob.md, "Sessions" review) ──
	let membership = $derived(data.memberships?.find((m) => m.accountId === data.account.id));
	let isAdmin = $derived(membership?.role === "owner" || membership?.role === "admin");
	const canEditComment = (c: { userId: string }) => data.user?.id === c.userId;
	const canDeleteComment = (c: { userId: string }) => canEditComment(c) || isAdmin;
	const commentsOf = (r: Recording) => data.comments.filter((c) => c.recordingId === r.id);
	/** The recordings whose review row is open by hand; the one playing is open too. */
	let expanded = $state<string[]>([]);
	function toggleReview(r: Recording) {
		expanded = expanded.includes(r.id) ? expanded.filter((id) => id !== r.id) : [...expanded, r.id];
	}
	const reviewOpen = (r: Recording) => expanded.includes(r.id) || current === r.id;
	const positionOf = (r: Recording) => (current === r.id ? playerTime : 0);
	const durationOf = (r: Recording) =>
		current === r.id && playerDuration ? playerDuration : (r.durationSeconds ?? 0);
	/** A click on a recording's waveform, or a comment's Go to: that recording to the moment, started if it was not playing. */
	async function seekIn(s: Session, r: Recording, seconds: number) {
		if (current !== r.id) await playRecording(s, r);
		player?.seekTo(seconds);
	}
	/** A drag across a recording's waveform selects a stretch to loop (the stem player's gesture); the recording starts if it was not playing. */
	async function loopIn(s: Session, r: Recording, region: { start: number; end: number } | null) {
		if (current !== r.id) await playRecording(s, r);
		player?.setLoop(region);
	}
	const sessionOf = (r: Recording) => data.sessions.find((s) => s.id === r.sessionId) ?? null;
	const recordingOf = (id: string) =>
		data.sessions.flatMap((s) => s.recordings).find((r) => r.id === id) ?? null;

	// ---- the comment popover: one, to post or edit ----
	let commentPanel = $state<HTMLDivElement | null>(null);
	let commentDraft = $state<{
		id: string | null;
		recordingId: string;
		title: string;
		body: string;
		at: string;
	}>({ id: null, recordingId: "", title: "", body: "", at: "" });
	const commentTarget = $derived(recordingOf(commentDraft.recordingId));
	function openComment(draft: Partial<typeof commentDraft> & { recordingId: string }) {
		commentDraft = { id: null, title: "", body: "", at: "", ...draft };
		const f = commentDraft.id ? updateSessionComment.fields : createSessionComment.fields;
		f.title.set(commentDraft.title);
		f.body.set(commentDraft.body);
		f.position.set(commentDraft.at);
		commentPanel?.showPopover();
	}
	function editComment(c: SessionCommentRow) {
		openComment({
			id: c.id,
			recordingId: c.recordingId,
			title: c.title,
			body: c.body,
			at: c.at === null ? "" : formatTime(c.at, 2),
		});
	}

	// ---- viewing links for one recording (its own page, docs/uploads-and-blob.md "Sessions"): one popover ----
	let sharePanel = $state<HTMLDivElement | null>(null);
	let sharing = $state<string | null>(null);
	const sharingRecording = $derived(sharing ? recordingOf(sharing) : null);
	const linksOf = (id: string) => data.shareLinks.filter((l) => l.recordingId === id);
	function openShare(r: Recording) {
		sharing = r.id;
		sharePanel?.showPopover();
	}

	// ---- ⌘-click on a waveform: Seek here, Comment here ----
	let menuAt = $state<{ recording: Recording; seconds: number; x: number; y: number } | null>(null);
	function closeMenu(e: Event) {
		if (menuAt && !(e.target as HTMLElement).closest("[data-recording-context]")) menuAt = null;
	}

	// ── A chat per session (docs/chat.md, "Sessions"): one panel, the open session's; what was fetched is kept ──
	let chatFor = $state<string | null>(null);
	let chats = $state<Record<string, { messages: ChatMessageRow[]; readAt: number | null }>>({});
	let chatLoading = $state(false);
	const chatSession = $derived(data.sessions.find((s) => s.id === chatFor) ?? null);
	async function openChat(s: Session) {
		if (chatFor === s.id) {
			chatFor = null;
			return;
		}
		if (!chats[s.id]) {
			chatLoading = true;
			try {
				chats[s.id] = {
					messages: await chatSince({ sessionId: s.id, after: 0 }),
					readAt: data.chat[s.id]?.readAt ?? null,
				};
			} catch (e) {
				notify(`Could not open the chat: ${errorMessage(e)}`, { kind: "error" });
				return;
			} finally {
				chatLoading = false;
			}
		}
		chatFor = s.id;
	}
	/** Unseen messages by others: from what the page fetched once the chat was opened, else the load's count. */
	const unreadOf = (s: Session) =>
		chats[s.id]
			? unreadCount(chats[s.id].messages, chats[s.id].readAt, data.user?.id ?? null)
			: (data.chat[s.id]?.unread ?? 0);
	const chatCountOf = (s: Session) =>
		chats[s.id] ? chats[s.id].messages.length : (data.chat[s.id]?.count ?? 0);

	// A notification's link: ?recording=<id> opens that recording's review; ?session=<id>&open=chat its chat. The query then goes.
	afterNavigate(async () => {
		const url = new URL(page.url.href);
		const recordingId = url.searchParams.get("recording");
		const sessionId = url.searchParams.get("session");
		const open = url.searchParams.get("open");
		if (!recordingId && !sessionId) return;
		url.searchParams.delete("recording");
		url.searchParams.delete("session");
		url.searchParams.delete("open");
		replaceState(url, {});
		if (recordingId && recordingOf(recordingId)) {
			if (!expanded.includes(recordingId)) expanded = [...expanded, recordingId];
			await tick();
			document
				.querySelector(`[data-recording="${recordingId}"]`)
				?.scrollIntoView({ block: "center" });
		}
		const session = sessionId ? data.sessions.find((s) => s.id === sessionId) : null;
		if (session && open === "chat") await openChat(session);
	});

	// ── Edit a session ──
	let editingSession = $state<string | null>(null);
	let sessionDraft = $state({
		kind: "practice" as SessionKind,
		name: "",
		startsOn: "",
		place: "",
		notes: "",
	});
	function startSessionEdit(s: Session) {
		editingRecording = null;
		editingSession = s.id;
		sessionDraft = {
			kind: s.kind,
			name: s.name,
			startsOn: s.startsOn,
			place: s.place,
			notes: s.notes,
		};
	}
	let saving = $state(false);
	async function saveSession(id: string) {
		saving = true;
		try {
			await updateSession({ id, ...sessionDraft });
			editingSession = null;
			await invalidateAll();
			refreshQueue();
			notify("Session saved");
		} catch (e) {
			notify(`Could not save: ${errorMessage(e)}`, { kind: "error" });
		} finally {
			saving = false;
		}
	}
	async function removeSession(s: Session) {
		const n = s.recordings.length;
		if (
			!confirm(
				n
					? `Delete "${nameOf(s)}" and its ${n} ${n === 1 ? "recording" : "recordings"}? The files go with it.`
					: `Delete "${nameOf(s)}"?`,
			)
		)
			return;
		try {
			await deleteSession({ id: s.id });
			await invalidateAll();
			refreshQueue();
			notify(`${nameOf(s)} deleted`);
		} catch (e) {
			notify(`Could not delete it: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	/** A second session of the same day, empty, to move recordings into (Kevin: an acoustic set in the afternoon and the show at night). */
	async function newSession(from: Session) {
		const name = prompt("Name for the new session", "");
		if (name === null) return;
		try {
			await createSession({
				accountId: data.account.id,
				kind: from.kind,
				name,
				startsOn: from.startsOn,
				place: from.place,
			});
			await invalidateAll();
			notify(`Session "${name || "untitled"}" added; move recordings into it from their menu`);
		} catch (e) {
			notify(`Could not add it: ${errorMessage(e)}`, { kind: "error" });
		}
	}

	// ── Edit a recording ──
	let editingRecording = $state<string | null>(null);
	let recordingDraft = $state({
		sessionId: "",
		title: "",
		recordedOn: "",
		notes: "",
		source: "",
		device: "" as SessionDevice,
		songId: "",
		newName: "",
	});
	/** The song picker: none, then the account's songs with their projects. */
	const songOptions = $derived([
		{ value: "", label: "No song", description: "a set, a jam, not one song" },
		...data.songs.map((s) => ({ value: s.id, label: s.title, description: s.project })),
	]);
	const songHref = (r: Recording) =>
		r.song ? `/${data.account.slug}/projects/${r.song.project.slug}/${r.song.slug}` : null;
	function startRecordingEdit(r: Recording) {
		editingSession = null;
		editingRecording = r.id;
		recordingDraft = {
			sessionId: r.sessionId,
			title: r.title,
			recordedOn: r.recordedOn,
			notes: r.notes,
			source: r.source,
			device: r.device,
			songId: r.songId ?? "",
			newName: "",
		};
	}
	/** The sessions a recording of the draft's day may join (that day's and the day before's), plus a new one. */
	const sessionChoices = $derived([
		...data.sessions
			.filter((s) => dayFitsSession(recordingDraft.recordedOn, s.startsOn))
			.map((s) => ({
				value: s.id,
				label: nameOf(s),
				description: `${SESSION_KIND_LABELS[s.kind]} · ${dayText(s.startsOn)}`,
			})),
		{ value: "new", label: "New session…", description: "named below, on the recording's day" },
	]);
	async function saveRecording(s: Session, r: Recording) {
		saving = true;
		try {
			let sessionId = recordingDraft.sessionId;
			if (sessionId === "new") {
				const made = await createSession({
					accountId: data.account.id,
					kind: s.kind,
					name: recordingDraft.newName,
					startsOn: recordingDraft.recordedOn,
					place: s.place,
				});
				sessionId = made.id;
			}
			await updateRecording({
				id: r.id,
				sessionId,
				title: recordingDraft.title,
				recordedOn: recordingDraft.recordedOn,
				notes: recordingDraft.notes,
				source: recordingDraft.source,
				device: recordingDraft.device,
				songId: recordingDraft.songId,
			});
			editingRecording = null;
			await invalidateAll();
			refreshQueue();
			notify("Recording saved");
		} catch (e) {
			notify(`Could not save: ${errorMessage(e)}`, { kind: "error" });
		} finally {
			saving = false;
		}
	}
	async function removeRecording(r: Recording) {
		if (!confirm(`Delete "${titleOf(r)}"? The file goes with it.`)) return;
		try {
			await deleteRecording({ id: r.id });
			await invalidateAll();
			refreshQueue();
			notify(`${titleOf(r)} deleted`);
		} catch (e) {
			notify(`Could not delete it: ${errorMessage(e)}`, { kind: "error" });
		}
	}
</script>

<svelte:head>
	<title>{pageTitle(`${data.copy.title} · ${data.account.name}`)}</title>
</svelte:head>

<main class="page">
	<!-- The title and the words under it are the page's copy doc, edited in the app by a system admin (docs/page-copy.md). -->
	<!-- The page's words from its copy doc, with the toolbar at the right on a desktop, as the Idea Recorder's (Kevin, 2026-10-26). -->
	<PageCopyHeader copy={data.copy} class="mb-6">
		{#snippet controls()}
			{@render toolbar()}
		{/snippet}
	</PageCopyHeader>
	{#if data.canEdit}
		{#if jobs.length > 0}
			<ul class="max-w-article mb-6 grid gap-1 text-13px" aria-label="Uploads">
				{#each jobs as job (job.name)}
					<li class="flex flex-wrap items-center gap-3">
						<span class="min-w-0 truncate">{job.name}</span>
						{#if job.error}
							<span class="text-red-400">{job.error}</span>
						{:else}
							<progress class="h-2 w-32" max="100" value={job.percent}></progress>
							<span class="tabular-nums text-dim">{Math.round(job.percent)}%</span>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	{/if}

	<!-- Kept mounted while closed: the <audio> and its EQ graph live in the player, so playback survives a minimize. -->
	<FloatingPanel
		open={playerOpen}
		title="Player"
		storageKey="stemshovel.sessions.player-panel"
		width={620}
		height={200}
		minHeight={180}
		keep={true}
		closable={true}
		extraClass="mb-6"
		onminimise={() => (playerOpen = false)}
	>
		<SessionPlayer
			bind:this={player}
			{queue}
			bind:current
			bind:paused
			bind:currentTime={playerTime}
			bind:duration={playerDuration}
			bind:loop={playerLoop}
			bind:looping={playerLooping}
			canEdit={data.canEdit}
			onsaveshared={async (id, eq) => (await saveSessionEq({ id, eq })).eq}
		/>
	</FloatingPanel>

	{#if data.sessions.length === 0}
		<p class="opacity-80">No sessions yet.</p>
	{:else}
		<div
			class="mb-3 flex flex-wrap items-center justify-start gap-1 text-13px"
			role="group"
			aria-label="Show"
		>
			<label class="relative w-full sm-mr-2 sm-w-72">
				<span class="sr-only">Search sessions</span>
				<span
					class="i-ph-magnifying-glass pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-dim"
					aria-hidden="true"
				></span>
				<input
					class="field w-full py-1 pl-7 text-13px"
					type="search"
					placeholder="Search sessions, recordings, comments"
					aria-label="Search sessions"
					bind:value={searchText}
				/>
			</label>
			{#each [["all", "All"], ["practice", "Practice"], ["show", "Show"]] as [k, label] (k)}
				<button
					type="button"
					class="rounded px-2.5 py-1 {filter === k
						? 'bg-white/15 text-neutral-100'
						: 'opacity-70 hover-opacity-100'}"
					aria-pressed={filter === k}
					onclick={() => (filter = k as typeof filter)}>{label}</button
				>
			{/each}
			<span class="ml-2 text-dim">{shown.length} {shown.length === 1 ? "session" : "sessions"}</span
			>
		</div>
		{#if query && shown.length === 0}
			<p class="opacity-80">Nothing matches "{searchText.trim()}".</p>
		{/if}
		{#each shown as s (s.id)}
			{@const nextDay = nextDayOf(s)}
			<section class="max-w-article surface mb-5" aria-label={nameOf(s)} data-session={s.id}>
				<!-- the session's header -->
				<div class="grid gap-2 border-b border-white/10 px-5 py-3">
					{#if editingSession === s.id}
						<form
							class="grid gap-2 text-14px"
							onsubmit={(e) => {
								e.preventDefault();
								void saveSession(s.id);
							}}
						>
							<div class="flex flex-wrap items-end gap-3">
								<label class="grid min-w-48 flex-1 gap-1 text-12px text-dim">
									Name
									<input
										class="field"
										type="text"
										maxlength="120"
										placeholder="{s.place || SESSION_KIND_LABELS[s.kind]} · {dayText(s.startsOn)}"
										bind:value={sessionDraft.name}
									/>
								</label>
								<label class="grid gap-1 text-12px text-dim">
									Kind
									<select class="field" bind:value={sessionDraft.kind}>
										{#each SESSION_KINDS as k (k)}
											<option value={k}>{SESSION_KIND_LABELS[k]}</option>
										{/each}
									</select>
								</label>
								<label class="grid gap-1 text-12px text-dim">
									Starts
									<input class="field" type="date" bind:value={sessionDraft.startsOn} />
								</label>
								<label class="grid min-w-40 gap-1 text-12px text-dim">
									Place
									<input
										class="field"
										type="text"
										maxlength="120"
										bind:value={sessionDraft.place}
									/>
								</label>
							</div>
							<label class="grid gap-1 text-12px text-dim">
								Notes
								<textarea class="field" rows="3" maxlength="2000" bind:value={sessionDraft.notes}
								></textarea>
							</label>
							<div class="flex gap-2">
								<button class="button-accent button-sm" type="submit" disabled={saving}>
									{saving ? "Saving…" : "Save"}
								</button>
								<button
									class="button button-sm"
									type="button"
									onclick={() => (editingSession = null)}>Cancel</button
								>
							</div>
						</form>
					{:else}
						<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
							<span
								class="rounded border px-1.5 py-0.5 text-10px uppercase tracking-wider {s.kind ===
								'show'
									? 'border-amber-300/60 text-amber-200'
									: 'border-white/25 opacity-80'}">{SESSION_KIND_LABELS[s.kind]}</span
							>
							<h2 class="min-w-0 truncate text-16px font-600">{nameOf(s)}</h2>
							<span class="text-13px text-dim">
								{dayText(s.startsOn)}{#if nextDay}
									– {dayText(nextDay)}{/if}{#if s.place && s.name}
									· {s.place}{/if} · {s.recordings.length}
								{s.recordings.length === 1 ? "recording" : "recordings"}{#if s.recordings.length}
									· {formatBytes(totalBytes(s))}{/if}
							</span>
							<span class="ml-auto flex items-center gap-1">
								<button
									class="button button-xs"
									type="button"
									title="Play the session's recordings in order"
									disabled={s.recordings.length === 0}
									onclick={() => playSession(s)}
								>
									<span class="i-ph-play-fill" aria-hidden="true"></span> Play all
								</button>
								<button
									class="button button-xs"
									type="button"
									title={mp3sReady(s)
										? `${mp3sReady(s)} of ${s.recordings.length} MP3s ready, in one zip`
										: "The MP3s are still rendering"}
									disabled={mp3sReady(s) === 0}
									onclick={() =>
										downloadBuilt(
											`/api/recording-sessions/${s.id}/mp3.zip`,
											"the session's MP3s",
											`${nameOf(s)} MP3s.zip`,
										)}
								>
									<span class="i-ph-file-zip" aria-hidden="true"></span> Download MP3s
								</button>
								{#if data.user}
									{@const unread = unreadOf(s)}
									<button
										class="button button-xs relative"
										type="button"
										title={unread
											? `Chat on ${nameOf(s)}: ${unread} new`
											: `Chat about ${nameOf(s)}`}
										aria-label="Chat on {nameOf(s)}{unread ? ` (${unread} new)` : ''}"
										aria-pressed={chatFor === s.id}
										disabled={chatLoading}
										onclick={() => void openChat(s)}
									>
										<span class="i-ph-chat-circle-dots" aria-hidden="true"></span>
										{#if chatCountOf(s)}<span class="tabular-nums">{chatCountOf(s)}</span>{/if}
										{#if unread}
											<span
												class="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-oxford"
												aria-hidden="true"
											></span>
										{/if}
									</button>
								{/if}
								{#if data.canEdit}
									<ContextMenu
										ariaLabel="{nameOf(s)} actions"
										position="bottom right"
										items={[
											{
												id: "edit",
												kind: "button",
												label: "Edit session",
												iconClass: "i-ph-pencil-simple",
												action: () => startSessionEdit(s),
											},
											{
												id: "new",
												kind: "button",
												label: "New session on this day…",
												iconClass: "i-ph-plus",
												title:
													"A second session of the same day (an afternoon set and the evening show), to move recordings into",
												action: () => newSession(s),
											},
											{ id: "d", kind: "divider" },
											{
												id: "delete",
												kind: "button",
												label: "Delete session",
												iconClass: "i-ph-trash",
												action: () => removeSession(s),
											},
										]}
									/>
								{/if}
							</span>
						</div>
						{#if s.notes}
							<p class="whitespace-pre-wrap text-13px opacity-85">{s.notes}</p>
						{/if}
					{/if}
				</div>
				<!-- the recordings, in the order they were made -->
				{#if s.recordings.length === 0}
					<p class="px-5 py-3 text-13px text-dim">No recordings yet.</p>
				{:else}
					<ul class="divide-y divide-white/10 text-15px" aria-label="{nameOf(s)} recordings">
						{#each recordingsShown(s) as r (r.id)}
							{@const i = s.recordings.indexOf(r)}
							{@const playing = current === r.id && !paused}
							{@const comments = commentsOf(r)}
							<li
								class="grid gap-2 px-5 py-2 {current === r.id ? 'bg-white/5' : ''}"
								data-recording={r.id}
							>
								{#if editingRecording === r.id}
									<form
										class="grid gap-2 text-14px"
										onsubmit={(e) => {
											e.preventDefault();
											void saveRecording(s, r);
										}}
									>
										<div class="flex flex-wrap items-end gap-3">
											<label class="grid min-w-48 flex-1 gap-1 text-12px text-dim">
												Title
												<input
													class="field"
													type="text"
													maxlength="120"
													bind:value={recordingDraft.title}
												/>
											</label>
											<label class="grid gap-1 text-12px text-dim">
												Day
												<input class="field" type="date" bind:value={recordingDraft.recordedOn} />
											</label>
											<SessionDeviceSelect
												bind:value={recordingDraft.device}
												class="grid gap-1 text-12px text-dim"
											/>
											<label class="grid min-w-40 gap-1 text-12px text-dim">
												Input name
												<input
													class="field"
													type="text"
													maxlength="120"
													placeholder="Kevin's phone, Room mic"
													bind:value={recordingDraft.source}
												/>
											</label>
											<label class="grid gap-1 text-12px text-dim">
												Song
												<ComboBox
													ariaLabel="Song of {titleOf(r)}"
													options={songOptions}
													value={recordingDraft.songId}
													onchange={(v) => (recordingDraft.songId = v)}
													buttonClasses="min-w-48"
												/>
											</label>
											<label class="grid gap-1 text-12px text-dim">
												Session
												<ComboBox
													ariaLabel="Session of {titleOf(r)}"
													options={sessionChoices}
													value={recordingDraft.sessionId}
													onchange={(v) => (recordingDraft.sessionId = v)}
													buttonClasses="min-w-56"
												/>
											</label>
											{#if recordingDraft.sessionId === "new"}
												<label class="grid min-w-48 gap-1 text-12px text-dim">
													New session's name
													<input
														class="field"
														type="text"
														maxlength="120"
														placeholder="Acoustic set"
														bind:value={recordingDraft.newName}
													/>
												</label>
											{/if}
										</div>
										<label class="grid gap-1 text-12px text-dim">
											Notes
											<textarea
												class="field"
												rows="2"
												maxlength="2000"
												bind:value={recordingDraft.notes}></textarea>
										</label>
										<div class="flex gap-2">
											<button class="button-accent button-sm" type="submit" disabled={saving}>
												{saving ? "Saving…" : "Save"}
											</button>
											<button
												class="button button-sm"
												type="button"
												onclick={() => (editingRecording = null)}>Cancel</button
											>
										</div>
									</form>
								{:else}
									<div class="flex items-center gap-x-3">
										<button
											type="button"
											class="grid h-9 w-9 shrink-0 place-items-center rounded border border-current/40 bg-transparent text-white active:scale-95 hover-text-accent hover-bg-white/5"
											aria-label={playing ? `Pause ${titleOf(r)}` : `Play ${titleOf(r)}`}
											onclick={() => playRecording(s, r)}
										>
											<span
												class={playing ? "i-ph-pause-fill" : "i-ph-play-fill"}
												aria-hidden="true"
											></span>
										</button>
										<span class="w-6 shrink-0 text-right tabular-nums text-dim text-13px"
											>{i + 1}</span
										>
										<span class="min-w-0 grow">
											<span class="block truncate font-500" title={r.filename}
												>{titleOf(r)}{#if r.source || r.device}
													<span
														class="ml-1.5 rounded border border-white/20 px-1 text-10px font-400 align-middle opacity-85"
														title="Input device and name"
														>{recordingInputText(r.device, r.source)}</span
													>{/if}{#if r.song}
													<a
														class="ml-1.5 text-12px font-400 link-dim"
														href={songHref(r)}
														title="The song this records">♪ {r.song.title}</a
													>{/if}</span
											>
											<span class="block text-12px text-dim">
												{#if r.recordedOn !== s.startsOn}{dayText(r.recordedOn)} ·
												{/if}{r.uploader?.name ?? "someone"} · {formatBytes(
													r.sizeBytes,
												)}{#if r.playbackStatus !== "ready"}
													· <span class="opacity-80"
														>{r.playbackStatus === "failed" ? "MP3 failed" : "MP3 rendering…"}</span
													>{/if}
											</span>
											{#if r.notes}
												<span class="block whitespace-pre-wrap text-12px opacity-85">{r.notes}</span
												>
											{/if}
										</span>
										<button
											type="button"
											class="flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-12px tabular-nums {reviewOpen(
												r,
											)
												? 'text-accent'
												: 'opacity-70 hover-opacity-100'}"
											title={reviewOpen(r)
												? "Hide the waveform and comments"
												: "Waveform and comments"}
											aria-label="Comments on {titleOf(r)} ({comments.length})"
											aria-pressed={reviewOpen(r)}
											onclick={() => toggleReview(r)}
										>
											<span class="i-ph-hands-clapping-bold" aria-hidden="true"></span>
											{#if comments.length}{comments.length}{/if}
										</button>
										<ContextMenu
											ariaLabel="{titleOf(r)} actions"
											position="bottom right"
											items={[
												{
													id: "mp3",
													kind: "button",
													label: "Download MP3",
													iconClass: "i-ph-download-simple",
													condition: r.playbackStatus === "ready" && !!r.playbackUrl,
													action: () =>
														saveAs(
															r.playbackUrl!,
															recordingDownloadName(
																r.title,
																r.filename,
																"mp3",
																r.source,
																SESSION_DEVICE_LABELS[r.device],
															),
														),
												},
												{
													id: "file",
													kind: "button",
													label: `Download ${r.playbackUrl ? "original" : "file"}`,
													iconClass: "i-ph-file-audio",
													title: r.filename,
													action: () =>
														saveAs(
															r.url,
															recordingDownloadName(
																r.title,
																r.filename,
																undefined,
																r.source,
																SESSION_DEVICE_LABELS[r.device],
															),
														),
												},
												{
													id: "page",
													kind: "button",
													label: "Open its page",
													iconClass: "i-ph-arrow-square-out",
													title: "The recording on a page of its own, where a viewing link lands",
													action: () => void goto(`/${data.account.slug}/sessions/r/${r.id}`),
												},
												{
													id: "share",
													kind: "button",
													label: `Share…${linksOf(r.id).some((l) => l.state === "open") ? " (linked)" : ""}`,
													iconClass: "i-ph-paper-plane-tilt",
													title: "Viewing links for this recording alone",
													condition: data.canEdit,
													action: () => openShare(r),
												},
												{ id: "d", kind: "divider", condition: data.canEdit },
												{
													id: "edit",
													kind: "button",
													label: "Edit recording",
													iconClass: "i-ph-pencil-simple",
													condition: data.canEdit,
													action: () => startRecordingEdit(r),
												},
												{
													id: "delete",
													kind: "button",
													label: "Delete recording",
													iconClass: "i-ph-trash",
													condition: data.canEdit,
													action: () => removeRecording(r),
												},
											]}
										/>
									</div>
									{#if reviewOpen(r)}
										<div class="pb-2 pl-12">
											<RecordingReview
												label={titleOf(r)}
												peaks={r.peaks}
												duration={durationOf(r)}
												position={positionOf(r)}
												{comments}
												canComment={!!data.user}
												card={commentCard}
												onseek={(seconds) => void seekIn(s, r, seconds)}
												loop={current === r.id ? playerLoop : null}
												onloop={(region) => void loopIn(s, r, region)}
												oncomment={() => openComment({ recordingId: r.id })}
												oncontext={(seconds, x, y) => (menuAt = { recording: r, seconds, x, y })}
											/>
										</div>
									{/if}
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/each}
	{/if}

	{#if chatSession && chats[chatSession.id]}
		<FloatingPanel
			open={true}
			title="Chat · {nameOf(chatSession)}"
			storageKey="stemshovel.sessions.chat-panel"
			width={440}
			height={600}
			onminimise={() => (chatFor = null)}
		>
			{#key chatSession.id}
				<SongChat
					sessionId={chatSession.id}
					bind:messages={chats[chatSession.id].messages}
					bind:readAt={chats[chatSession.id].readAt}
					me={data.user ? { id: data.user.id, name: data.user.name } : null}
					{isAdmin}
					canWrite={!!data.user}
					onseek={(seconds) => {
						const r = queue.find((t) => t.id === current) && current ? recordingOf(current) : null;
						const s = r ? sessionOf(r) : null;
						if (r && s) void seekIn(s, r, seconds);
					}}
				/>
			{/key}
		</FloatingPanel>
	{/if}
</main>

<svelte:window onpointerdown={closeMenu} />

<!-- The toolbar: the uploads for a member, and the Player button once a track has been chosen (its own snippet, so the template stays scoreable). -->
{#snippet toolbar()}
	{#if data.canEdit || current !== null}
		<div class="flex flex-wrap items-center gap-3" role="group" aria-label="Sessions toolbar">
			{#if data.canEdit}
				<!-- Styled as the Idea Recorder's New Idea button. -->
				<button
					class="button button-sm sm-bg-accent sm-text-oxford shrink-0"
					type="button"
					popovertarget="add-recording"
				>
					<span class="i-ph-plus" aria-hidden="true"></span> Add a recording
				</button>
				<a
					class="button button-sm"
					href="/{data.account.slug}/sessions/record"
					title="Record the room from this device, straight into the sessions"
				>
					<span class="i-ph-record-fill text-red-400" aria-hidden="true"></span> Record a session
				</a>
			{/if}
			{#if current !== null}
				<!-- The player's panel collapses to this button and comes back with it; lit while something plays. -->
				<button
					class="button button-sm data-[active=true]:border-accent data-[active=true]:bg-accent/20 data-[active=true]:text-accent"
					type="button"
					data-active={!paused}
					aria-pressed={playerOpen}
					title={currentTitle}
					onclick={() => (playerOpen = !playerOpen)}
				>
					<span class={paused ? "i-ph-play-circle" : "i-ph-pause-circle"} aria-hidden="true"></span> Player
				</button>
			{/if}
		</div>
	{/if}
{/snippet}

{#snippet commentCard(id: string)}
	{@const c = data.comments.find((x) => x.id === id)}
	{#if c}
		{@const r = recordingOf(c.recordingId)}
		{@const remove = deleteSessionComment.for(c.id)}
		<div class="flex items-baseline justify-between gap-3">
			<h3 class="font-600">{c.title}</h3>
			{#if c.editedAt}<span
					class="rounded border border-current/30 px-1 text-9px uppercase tracking-wider"
					>edited</span
				>{/if}
		</div>
		<p class="mt-1 text-12px opacity-70">
			{c.authorName} · {formatDate(c.createdAt)}{#if c.at !== null}
				· {formatTime(c.at, 1)}{/if}
		</p>
		<p class="mt-2 whitespace-pre-line">{c.body}</p>
		<div class="mt-3 flex gap-3 text-12px">
			{#if c.at !== null && r}
				{@const s = sessionOf(r)}
				<button
					type="button"
					class="link-dim"
					onclick={() => {
						if (s) void seekIn(s, r, c.at ?? 0);
					}}>Go to</button
				>
			{/if}
			{#if canEditComment(c)}
				<button type="button" class="link-dim" onclick={() => editComment(c)}>Edit</button>
			{/if}
			{#if canDeleteComment(c)}
				<form
					{...remove.enhance(async ({ submit }) => {
						if (!confirm(`Delete the comment "${c.title}"?`)) return;
						try {
							await submit();
						} catch (e) {
							notify(`Could not delete it: ${errorMessage(e)}`, { kind: "error" });
							return;
						}
						notify("Comment deleted");
						await invalidateAll();
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

{#if menuAt}
	<!-- Ctrl / ⌘-click menu at the pointer. The handlers read the menu before closing it: a closed block's constants are gone. -->
	<div
		class="fixed z-40 w-56 rounded border border-white/15 bg-oxford-800 p-1 text-sm shadow-lg shadow-black/50"
		style:left="{Math.min(menuAt.x, window.innerWidth - 240)}px"
		style:top="{menuAt.y + 4}px"
		role="menu"
		data-recording-context
	>
		<div class="truncate px-3 py-1.5 text-xs opacity-70">
			{titleOf(menuAt.recording)} · {formatTime(menuAt.seconds, 1)}
		</div>
		<button
			class="block w-full rounded px-3 py-1.5 text-left hover:bg-white/10"
			type="button"
			role="menuitem"
			onclick={() => {
				const menu = menuAt;
				menuAt = null;
				const s = menu && sessionOf(menu.recording);
				if (menu && s) void seekIn(s, menu.recording, menu.seconds);
			}}
		>
			<span class="i-ph-skip-forward mr-2" aria-hidden="true"></span>Seek here
		</button>
		{#if data.user}
			<button
				class="block w-full rounded px-3 py-1.5 text-left hover:bg-white/10"
				type="button"
				role="menuitem"
				onclick={() => {
					const menu = menuAt;
					menuAt = null;
					if (menu)
						openComment({ recordingId: menu.recording.id, at: formatTime(menu.seconds, 2) });
				}}
			>
				<span class="i-ph-hands-clapping-bold mr-2" aria-hidden="true"></span>Comment here
			</button>
		{/if}
	</div>
{/if}

{#if data.canEdit}
	<!-- The upload panel: closes once files are picked, so the progress shows on the page. -->
	<div
		id="add-recording"
		popover="auto"
		bind:this={addPanel}
		class="m-auto max-h-[calc(100vh-2rem)] overflow-y-auto w-[min(40rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
	>
		<div class="mb-4 flex items-center justify-between gap-4">
			<h2 class="heading-2 mb-0">Add a recording</h2>
			<button
				class="button button-xs"
				type="button"
				popovertarget="add-recording"
				popovertargetaction="hide"
			>
				Close
			</button>
		</div>
		<div
			class="flex flex-wrap items-end gap-x-4 gap-y-3"
			role="group"
			aria-label="Upload recordings"
		>
			<label class="grid gap-1 text-13px text-dim">
				Session
				<ComboBox
					ariaLabel="Session"
					options={sessionOptions}
					value={intoSession}
					onchange={(v) => (intoSession = v)}
					buttonClasses="min-w-56"
				/>
			</label>
			{#if intoSession === "auto"}
				<fieldset class="grid gap-1 text-13px text-dim">
					<legend class="mb-1">Kind of a new session</legend>
					<span class="flex items-center">
						{#each SESSION_KINDS as k (k)}
							<button
								type="button"
								class="rounded border px-3 py-1 text-14px {kind === k
									? 'border-blue-300 bg-blue-300 text-dark'
									: 'border-current/40 opacity-80 hover-opacity-100'} {k === 'practice'
									? 'rounded-r-none'
									: 'rounded-l-none border-l-0'}"
								aria-pressed={kind === k}
								onclick={() => (kind = k)}>{SESSION_KIND_LABELS[k]}</button
							>
						{/each}
					</span>
				</fieldset>
				<label class="grid gap-1 text-13px text-dim">
					Place
					<input
						class="field"
						type="text"
						placeholder="The rehearsal room, the venue"
						maxlength="120"
						bind:value={place}
					/>
				</label>
			{/if}
			<SessionDeviceSelect
				bind:value={device}
				title="What kind of device captured these files (optional)"
			/>
			<label class="grid gap-1 text-13px text-dim">
				Input name
				<input
					class="field"
					type="text"
					placeholder="Kevin's phone, Room mic"
					title="The name of the input these files were captured on, to tell apart recordings of one performance from several devices (optional)"
					maxlength="120"
					bind:value={source}
				/>
			</label>
			<label class="button-accent cursor-pointer {busy ? 'opacity-60 pointer-events-none' : ''}">
				<span class="i-ph-upload-simple" aria-hidden="true"></span>
				{busy ? "Uploading…" : "Choose files"}
				<input
					class="sr-only"
					type="file"
					accept={DEMO_ACCEPT}
					multiple
					disabled={busy}
					onchange={(e) => uploadPicked(e.currentTarget)}
				/>
			</label>
		</div>
		<p class="mt-4 text-12px text-dim">
			Audio in any format a demo takes, up to {formatBytes(SESSION_MAX_BYTES)} a file. Each file is dated
			by its own clock: by default it joins that day's session (or the day before's, for a show past midnight),
			or a new one named after the place and the day. An MP3 of each renders for playing and the session's
			download.
		</p>
	</div>

	<!-- Viewing links for one recording: its own page is where they land (docs/uploads-and-blob.md, "Sessions"). -->
	<div
		id="recording-share"
		popover="auto"
		bind:this={sharePanel}
		onbeforetoggle={(e) => {
			if (e.newState === "closed") void invalidateAll();
		}}
		class="m-auto max-h-[calc(100vh-2rem)] overflow-y-auto w-[min(32rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
	>
		<div class="mb-4 flex items-center justify-between gap-4">
			<h2 class="heading-2 mb-0">
				Share{#if sharingRecording}
					"{titleOf(sharingRecording)}"{/if}
			</h2>
			<button
				class="button button-xs"
				type="button"
				popovertarget="recording-share"
				popovertargetaction="hide"
			>
				Close
			</button>
		</div>
		<p class="mb-3 text-sm text-dim">
			A link opens this one recording on a page of its own, for someone outside the band; the rest
			of the sessions stay members-only.
		</p>
		{#if sharingRecording}
			{#key sharingRecording.id}
				<ShareLinks
					target={{ recordingId: sharingRecording.id }}
					links={linksOf(sharingRecording.id)}
					isPrivate={true}
				/>
			{/key}
		{/if}
	</div>
{/if}

{#if data.user}
	<!-- One popover for posting and editing a comment on a recording. -->
	<div
		id="recording-comment"
		popover="auto"
		bind:this={commentPanel}
		class="m-auto max-h-[calc(100vh-2rem)] overflow-y-auto w-[min(32rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
	>
		<div class="mb-4 flex items-center justify-between gap-4">
			<h2 class="heading-2 mb-0">
				{commentDraft.id ? "Edit comment" : "Add a comment"}{#if commentTarget}
					on {titleOf(commentTarget)}{/if}
			</h2>
			<button
				class="button button-xs"
				type="button"
				popovertarget="recording-comment"
				popovertargetaction="hide"
			>
				Close
			</button>
		</div>
		{#if commentDraft.id}
			{@const remoteForm = updateSessionComment}
			<form
				class="grid gap-3"
				{...remoteForm.enhance(async ({ submit }) => {
					await submit();
					if (!remoteForm.fields.allIssues()) {
						notify("Comment updated");
						commentPanel?.hidePopover();
						await invalidateAll();
					}
				})}
			>
				<input {...remoteForm.fields.id.as("hidden", commentDraft.id)} />
				{@render commentFields(remoteForm)}
				<button class="button-accent justify-self-start" disabled={!!remoteForm.pending}
					>{remoteForm.pending ? "Saving…" : "Save"}</button
				>
			</form>
		{:else}
			{@const remoteForm = createSessionComment}
			<form
				class="grid gap-3"
				{...remoteForm.enhance(async ({ submit }) => {
					await submit();
					if (!remoteForm.fields.allIssues()) {
						notify("Comment posted");
						commentPanel?.hidePopover();
						if (commentDraft.recordingId && !expanded.includes(commentDraft.recordingId))
							expanded = [...expanded, commentDraft.recordingId];
						await invalidateAll();
					}
				})}
			>
				<input {...remoteForm.fields.recordingId.as("hidden", commentDraft.recordingId)} />
				{@render commentFields(remoteForm)}
				<button class="button-accent justify-self-start" disabled={!!remoteForm.pending}
					>{remoteForm.pending ? "Posting…" : "Post comment"}</button
				>
			</form>
		{/if}
	</div>
{/if}

{#snippet commentFields(remoteForm: typeof createSessionComment | typeof updateSessionComment)}
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
		<span class="text-sm opacity-80"
			>Position <span class="opacity-60">(optional, as time)</span></span
		>
		<span class="mt-1 flex items-center gap-2">
			<input
				class="field font-mono text-sm"
				placeholder="1:23.4"
				{...remoteForm.fields.position.as("text", commentDraft.at)}
			/>
			<button
				class="button button-xs shrink-0"
				type="button"
				disabled={!player || current !== commentDraft.recordingId}
				title={current === commentDraft.recordingId
					? "Where the recording is playing"
					: "Play the recording to take its position"}
				onclick={() =>
					remoteForm.fields.position.set(formatTime(player?.currentPosition() ?? 0, 2))}
				>Playhead</button
			>
		</span>
		{#each remoteForm.fields.position.issues() ?? [] as issue (issue.message)}
			<p class="mt-1 text-sm text-red-400">{issue.message}</p>
		{/each}
	</label>
{/snippet}
