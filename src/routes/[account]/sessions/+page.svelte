<script lang="ts">
	import { invalidateAll } from "$app/navigation";
	import ComboBox from "#lib/components/ComboBox.svelte";
	import ContextMenu from "#lib/components/ContextMenu.svelte";
	import SessionPlayer, { type SessionTrack } from "#lib/components/SessionPlayer.svelte";
	import { DEMO_ACCEPT } from "#lib/constants/demoFormats.js";
	import {
		SESSION_KIND_LABELS,
		SESSION_KINDS,
		SESSION_MAX_BYTES,
		type SessionKind,
	} from "#lib/constants/sessionRecordings.js";
	import {
		createSession,
		deleteRecording,
		deleteSession,
		updateRecording,
		updateSession,
	} from "#lib/remote/sessions.remote.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { postJson, saveAs, uploadSessionFile, type SessionReservation } from "#lib/upload.js";
	import { downloadBuilt } from "#lib/utils/downloadBuilt.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import { formatBytes } from "#lib/utils/formatBytes.js";
	import { dayFitsSession, localDay } from "#lib/utils/isoDay.js";
	import { pageTitle } from "#lib/utils/pageTitle.js";
	import { dayText, sessionDisplayName } from "#lib/utils/sessionName.js";

	let { data } = $props();

	type Session = (typeof data.sessions)[number];
	type Recording = Session["recordings"][number];

	const nameOf = (s: Session) => sessionDisplayName(s);
	const titleOf = (r: Recording) => r.title || r.filename;
	/** What plays: the MP3 once rendered, else the file as uploaded (which not every browser can play). */
	const urlOf = (r: Recording) => r.playbackUrl ?? r.url;
	const tracksOf = (s: Session): SessionTrack[] =>
		s.recordings.map((r) => ({ id: r.id, title: titleOf(r), url: urlOf(r), session: nameOf(s) }));
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
	function playRecording(s: Session, r: Recording) {
		if (!queue.some((t) => t.id === r.id)) queue = tracksOf(s);
		void player?.play(r.id);
	}
	function playSession(s: Session) {
		if (s.recordings.length === 0) return;
		queue = tracksOf(s);
		void player?.play(s.recordings[0]!.id);
	}
	/** After an edit or a delete, the queue follows the list (a renamed track, a gone one). */
	function refreshQueue() {
		const all = new Map(data.sessions.flatMap((s) => tracksOf(s).map((t) => [t.id, t] as const)));
		queue = queue.flatMap((t) => (all.has(t.id) ? [all.get(t.id)!] : []));
		if (current && !all.has(current)) {
			current = null;
			paused = true;
		}
	}

	// ── Upload ──
	let kind = $state<SessionKind>("practice");
	let place = $state("");
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
	async function uploadPicked(input: HTMLInputElement) {
		const picked = [...(input.files ?? [])];
		input.value = "";
		if (picked.length === 0) return;
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

	// ── Browse ──
	let filter = $state<"all" | SessionKind>("all");
	const shown = $derived(
		filter === "all" ? data.sessions : data.sessions.filter((s) => s.kind === filter),
	);

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
	let recordingDraft = $state({ sessionId: "", title: "", recordedOn: "", notes: "", newName: "" });
	function startRecordingEdit(r: Recording) {
		editingSession = null;
		editingRecording = r.id;
		recordingDraft = {
			sessionId: r.sessionId,
			title: r.title,
			recordedOn: r.recordedOn,
			notes: r.notes,
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
	<title>{pageTitle(`Sessions · ${data.account.name}`)}</title>
</svelte:head>

<main class="page">
	<header class="max-w-article mb-6">
		<h1 class="heading-2">Sessions</h1>
		<p class="opacity-90 text-balance">
			The band's tapes: every practice and show with its recordings, for every member of {data
				.account.name} to hear and download. Upload what the phone or the recorder caught and it lands
			in the session of its day; name the session, sort the recordings, and it is here for everyone.
		</p>
	</header>

	{#if data.canEdit}
		<section class="max-w-article surface mb-6 px-5 py-4" aria-label="Upload recordings">
			<h2 class="font-600 mb-3">Add recordings</h2>
			<div class="flex flex-wrap items-end gap-x-4 gap-y-3">
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
			<p class="mt-2 text-12px text-dim">
				Audio in any format a demo takes, up to {formatBytes(SESSION_MAX_BYTES)} a file. Each file is
				dated by its own clock: by default it joins that day's session (or the day before's, for a show
				past midnight), or a new one named after the place and the day. An MP3 of each renders for playing
				and the session's download.
			</p>
			{#if jobs.length > 0}
				<ul class="mt-3 grid gap-1 text-13px" aria-label="Uploads">
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
		</section>
	{/if}

	<div class="max-w-article mb-6">
		<SessionPlayer bind:this={player} {queue} bind:current bind:paused />
	</div>

	{#if data.sessions.length === 0}
		<p class="opacity-80">No sessions yet.</p>
	{:else}
		<div class="mb-3 flex items-center gap-1 text-13px" role="group" aria-label="Show">
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
						{#each s.recordings as r, i (r.id)}
							{@const playing = current === r.id && !paused}
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
											<span class="block truncate font-500" title={r.filename}>{titleOf(r)}</span>
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
													action: () => saveAs(r.playbackUrl!, `${titleOf(r)}.mp3`),
												},
												{
													id: "file",
													kind: "button",
													label: `Download ${r.playbackUrl ? "original" : "file"}`,
													iconClass: "i-ph-file-audio",
													title: r.filename,
													action: () => saveAs(r.url, r.filename),
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
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/each}
	{/if}
</main>
