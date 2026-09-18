<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";
	import DemoRecorder from "$lib/components/DemoRecorder.svelte";
	import RecordingActions from "$lib/components/RecordingActions.svelte";
	import IdeaNotesPanel from "$lib/components/IdeaNotesPanel.svelte";
	import {
		deleteRecording,
		saveRecordingNotes,
		setRecordingTitle,
	} from "$lib/remote/recordings.remote";
	import { notify } from "$lib/state/notifications.svelte";
	import { errorMessage } from "$lib/utils/errorMessage";
	import { formatDate } from "$lib/utils/formatDate";
	import { formatTime } from "$lib/utils/formatTime";
	import { invalidateAll } from "$app/navigation";

	let { data } = $props();
	type Recording = (typeof data.recordings)[number];
	let recorder = $state<DemoRecorder | null>(null);
	/** The recording in the player and the notes panel: just saved, or picked from the list. */
	let selectedId = $state<string | null>(null);
	let selected = $derived(data.recordings.find((r) => r.id === selectedId) ?? null);
	/** What the recorder is doing; the list is frozen mid-take. */
	let phase = $state("idle");
	let recorderBusy = $derived(
		phase === "recording" || phase === "paused" || phase === "requesting" || phase === "saving",
	);
	/**
	 * The notes panel's text. It carries over from take to take (chords or
	 * lyrics jotted once serve several takes) until "Clear notes" empties it.
	 */
	let notesDraft = $state("");
	/** Bumped to re-seed the notes panel (a clear, or a different recording). */
	let notesKey = $state(0);

	function pick(r: Recording) {
		if (recorderBusy || !recorder) return;
		selectedId = r.id;
		notesDraft = r.notes;
		notesKey++;
		recorder.load(r);
	}
	function newIdea() {
		if (recorderBusy || !recorder) return;
		selectedId = null;
		notesKey++;
		recorder.reset();
	}
	async function clearNotes() {
		notesDraft = "";
		notesKey++;
		if (selected) {
			try {
				await saveRecordingNotes({ id: selected.id, markdown: "" });
				await invalidateAll();
			} catch (e) {
				notify(errorMessage(e), { kind: "error" });
			}
		}
	}
	async function renamed(r: { id: string; title: string }) {
		try {
			await setRecordingTitle(r);
			await invalidateAll();
		} catch (e) {
			notify(`Title not saved: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	const fmtWhen = (d: Date) =>
		`${formatDate(d)} ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase()}`;
</script>

<svelte:head>
	<title>{pageTitle("Idea Recorder")}</title>
</svelte:head>

<main class="page">
	<header class="max-w-article flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="heading-2">Idea Recorder</h1>
			<p class="opacity-90 text-balance">
				A riff, a lick, a melody idea or a whole take. Recordings stay here; add one to a song to
				make it a demo.
				{#if data.fromSong}
					Opened from <a class="link-dim" href={data.fromSong.href}>{data.fromSong.title}</a>.
				{/if}
			</p>
		</div>
		<a class="button button-sm" href="/{data.account.slug}/ideas/recordings">
			<span class="i-ph-waveform" aria-hidden="true"></span>
			All recordings
		</a>
	</header>

	<!-- Like the song page: the recorder where the player is, the notes where the documents are. -->
	<div class="grid grid-cols-1 gap-8 xl-grid-cols-2">
		<section class="grid grid-cols-1 gap-6 place-content-start h-full w-full" aria-label="Recorder">
			<DemoRecorder
				bind:this={recorder}
				accountId={data.account.id}
				getNotes={() => notesDraft}
				onstart={() => {
					// A new take: the list's selection goes, the notes stay for it.
					selectedId = null;
					notesKey++;
				}}
				onphase={(p) => (phase = p)}
				ontitlechange={renamed}
				onsaved={async (r) => {
					notify(`Saved “${r.title}”`);
					selectedId = r.id;
					await invalidateAll();
				}}
			/>

			<!-- The library, as a voice-memo list: the newest first, one selected into the player above. -->
			<div class="grid gap-2" aria-label="Recordings">
				<div class="flex items-baseline justify-between gap-3">
					<h2 class="heading-3 mb-0">Recordings</h2>
					<button
						class="link-dim text-sm disabled:opacity-40"
						type="button"
						disabled={recorderBusy || (!selectedId && phase === "idle")}
						onclick={newIdea}>New idea</button
					>
				</div>
				{#if data.recordings.length === 0}
					<p
						class="rounded border border-dashed border-white/15 px-4 py-4 text-center text-sm opacity-90"
					>
						Nothing recorded yet. Your takes will list here.
					</p>
				{:else}
					<ul
						class="max-h-80 overflow-y-auto rounded border border-current/40 bg-blue-300/5 divide-y divide-white/10 {recorderBusy
							? 'opacity-60'
							: ''}"
					>
						{#each data.recordings as r (r.id)}
							<li>
								<button
									class="grid w-full grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-0.5 px-4 py-2.5 text-left hover:bg-white/5 disabled:cursor-default {r.id ===
									selectedId
										? 'bg-blue-300/15'
										: ''}"
									type="button"
									aria-current={r.id === selectedId ? "true" : undefined}
									disabled={recorderBusy}
									onclick={() => pick(r)}
								>
									<span class="truncate font-500">{r.title}</span>
									<span class="text-sm tabular-nums opacity-80"
										>{r.durationSeconds !== null ? formatTime(r.durationSeconds, 0) : "–:––"}</span
									>
									<span class="text-12px opacity-70">{fmtWhen(r.createdAt)}</span>
									{#if r.notes.trim()}
										<span class="truncate text-12px opacity-70"
											>{r.notes.trim().split("\n")[0]}</span
										>
									{/if}
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			{#if selected}
				{@const remove = deleteRecording.for(selected.id)}
				<div class="surface grid gap-5 px-5 py-5" aria-label="Selected recording">
					<div class="flex flex-wrap items-baseline justify-between gap-3">
						<h2 class="heading-3 mb-0">{selected.title}</h2>
						<form
							{...remove.enhance(async ({ submit }) => {
								if (
									!confirm(`Delete “${selected?.title}”? Demos made from it stay on their songs.`)
								)
									return;
								await submit();
								if (remove.result?.deleted) {
									notify("Deleted");
									selectedId = null;
									recorder?.reset();
									await invalidateAll();
								}
							})}
						>
							<input {...remove.fields.id.as("hidden", selected.id)} />
							<button class="link-dim text-sm text-red-400" disabled={!!remove.pending}>
								{remove.pending ? "Deleting…" : "Delete"}
							</button>
						</form>
					</div>
					<RecordingActions
						recording={selected}
						projects={data.projects}
						fromSong={data.fromSong}
					/>
				</div>
			{/if}
		</section>

		<!-- Notes: the selected recording's, or the draft that carries into the next take. -->
		<section class="min-h-560px" aria-label="Notes">
			{#key `${selectedId ?? "draft"}/${notesKey}`}
				<IdeaNotesPanel
					recording={{ id: selectedId, notes: notesDraft }}
					ondraft={(m) => (notesDraft = m)}
					onchange={(m) => (notesDraft = m)}
					onclear={clearNotes}
				/>
			{/key}
		</section>

		<p class="text-13px opacity-70">
			Tips: keep the screen on and the app in front while recording (a phone stops the microphone
			when it sleeps or switches apps). Voice processing is switched off so instruments sound like
			themselves. The take is saved as your browser recorded it and converted to MP3 for playback.
			Notes carry over from take to take until you clear them.
		</p>
	</div>
</main>
