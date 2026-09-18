<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";
	import RecordingActions from "$lib/components/RecordingActions.svelte";
	import RecordingNotes from "$lib/components/RecordingNotes.svelte";
	import { deleteRecording, renameRecording } from "$lib/remote/recordings.remote";
	import { notify } from "$lib/state/notifications.svelte";
	import { clearForm } from "$lib/utils/clearForm";
	import { formatBytes } from "$lib/utils/formatBytes";
	import { formatDate } from "$lib/utils/formatDate";
	import { formatTime } from "$lib/utils/formatTime";
	import { invalidateAll } from "$app/navigation";

	let { data } = $props();
	type Recording = (typeof data.recordings)[number];
	/** The recording the shared popovers act on. */
	let active = $state<Recording | null>(null);
	let addPanel = $state<HTMLDivElement | null>(null);
	let renamePanel = $state<HTMLDivElement | null>(null);

	function openAdd(r: Recording) {
		active = r;
		addPanel?.showPopover();
	}
	function openRename(r: Recording) {
		active = r;
		clearForm(renameRecording);
		renamePanel?.showPopover();
	}
</script>

<svelte:head>
	<title>{pageTitle("Recordings")}</title>
</svelte:head>

<main class="page">
	<header class="max-w-article flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="heading-2">Recordings</h1>
			<p class="opacity-90 text-balance">
				Scratch recordings from the idea recorder: riffs, licks, melody ideas, whole takes. They are
				not demos until you add one to a song.
			</p>
		</div>
		<a class="button button-sm" href="/{data.account.slug}/recorder">
			<span class="i-ph-record-fill text-red-500" aria-hidden="true"></span>
			Record
		</a>
	</header>

	{#if data.recordings.length === 0}
		<p
			class="max-w-article rounded border border-dashed border-white/15 px-4 py-6 text-center text-sm opacity-90"
		>
			Nothing recorded yet. <a class="link-dim" href="/{data.account.slug}/recorder"
				>Open the recorder.</a
			>
		</p>
	{:else}
		<ul class="grid max-w-article gap-3" aria-label="Recordings">
			{#each data.recordings as r (r.id)}
				{@const remove = deleteRecording.for(r.id)}
				<li class="surface grid gap-3 px-4 py-3">
					<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
						<span class="font-600">{r.title}</span>
						<span class="text-12px opacity-70">
							{formatDate(r.createdAt)}
							{#if r.durationSeconds !== null}· {formatTime(r.durationSeconds, 0)}{/if}
							· {formatBytes(r.sizeBytes)}{#if r.recordedBy}
								· {r.recordedBy}{/if}
						</span>
					</div>
					<!-- svelte-ignore a11y_media_has_caption -->
					<audio class="w-full" controls preload="none" src={r.playbackUrl ?? r.url}></audio>
					<!-- The idea's notes: closed by default, a line of preview when there are any. -->
					<details class="group">
						<summary class="cursor-pointer list-none text-sm [&::-webkit-details-marker]:hidden">
							<span
								class="i-ph-caret-right inline-block align-[-2px] group-open:rotate-90"
								aria-hidden="true"
							></span>
							Notes{#if r.notes.trim()}<span class="ml-2 opacity-70"
									>{r.notes.trim().split("\n")[0].slice(0, 80)}</span
								>{/if}
						</summary>
						<div class="mt-2">
							<RecordingNotes recording={r} compact />
						</div>
					</details>
					{#if r.playbackStatus !== "ready"}
						<p class="text-12px opacity-70">
							{r.playbackStatus === "failed"
								? "The MP3 could not be made; the original plays where the browser can."
								: "Converting to MP3…"}
						</p>
					{/if}
					<div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
						<button class="button button-xs" type="button" onclick={() => openAdd(r)}>
							<span class="i-ph-plus" aria-hidden="true"></span>
							Add to a song
						</button>
						<button class="link-dim" type="button" onclick={() => openRename(r)}>Rename</button>
						<a class="link-dim" href={r.url} download>Download</a>
						<form
							{...remove.enhance(async ({ submit }) => {
								if (!confirm(`Delete “${r.title}”? Demos made from it stay on their songs.`))
									return;
								await submit();
								if (remove.result?.deleted) {
									notify(`Deleted “${r.title}”`);
									await invalidateAll();
								}
							})}
						>
							<input {...remove.fields.id.as("hidden", r.id)} />
							<button class="link-dim text-red-400" disabled={!!remove.pending}>
								{remove.pending ? "Deleting…" : "Delete"}
							</button>
						</form>
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	<!-- Add to a song: one popover for the list, acting on `active`. -->
	<div
		id="add-recording"
		popover="auto"
		bind:this={addPanel}
		class="m-auto max-h-[calc(100dvh-2rem)] overflow-y-auto w-[min(36rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
	>
		<div class="mb-4 flex items-center justify-between gap-4">
			<h2 class="heading-2 mb-0">Add to a song</h2>
			<button
				class="button button-xs"
				type="button"
				popovertarget="add-recording"
				popovertargetaction="hide">Close</button
			>
		</div>
		{#if active}
			<p class="mb-4 text-sm opacity-90">
				“{active.title}” is copied onto the song as a demo and stays here.
			</p>
			{#key active.id}
				<RecordingActions recording={active} projects={data.projects} />
			{/key}
		{/if}
	</div>

	<!-- Rename -->
	<div
		id="rename-recording"
		popover="auto"
		bind:this={renamePanel}
		class="m-auto max-h-[calc(100dvh-2rem)] overflow-y-auto w-[min(28rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
	>
		<div class="mb-4 flex items-center justify-between gap-4">
			<h2 class="heading-2 mb-0">Rename</h2>
			<button
				class="button button-xs"
				type="button"
				popovertarget="rename-recording"
				popovertargetaction="hide">Close</button
			>
		</div>
		{#if active}
			{#key active.id}
				<form
					{...renameRecording.enhance(async ({ submit }) => {
						await submit();
						if (renameRecording.result?.renamed) {
							notify("Renamed");
							renamePanel?.hidePopover();
							await invalidateAll();
						}
					})}
				>
					<input {...renameRecording.fields.id.as("hidden", active.id)} />
					<label class="block">
						<span class="text-sm opacity-90">Title</span>
						<input
							class="mt-1 field"
							{...renameRecording.fields.title.as("text", active.title)}
							maxlength="120"
							autocomplete="off"
							data-1p-ignore
							data-lpignore="true"
							data-bwignore
							required
						/>
						{#each renameRecording.fields.title.issues() ?? [] as issue (issue.message)}
							<p class="mt-1 text-sm text-red-400">{issue.message}</p>
						{/each}
					</label>
					<div class="mt-4">
						<button class="button-accent" disabled={!!renameRecording.pending}>
							{renameRecording.pending ? "Saving…" : "Save"}
						</button>
					</div>
				</form>
			{/key}
		{/if}
	</div>
</main>
