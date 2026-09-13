<script lang="ts">
	import ProjectPlayer from "$lib/components/ProjectPlayer.svelte";
	import { formatTime } from "$lib/utils/formatTime";
	import { slugify } from "$lib/utils/slugify";
	import { updateProject } from "$lib/remote/projects.remote";
	import { createSong } from "$lib/remote/songs.remote";

	let { data } = $props();

	let open = $state(false);
	let saved = $state(false);
	let addSongPanel = $state<HTMLDivElement | null>(null);
	let player = $state<ProjectPlayer | null>(null);
	let playing = $state<string | null>(null);
	let paused = $state(true);
	const fields = updateProject.fields;

	// Live values: `value()` is undefined until the user edits, so fall back
	// to what the project has now.
	let name = $derived(fields.name.value() ?? data.project.name);
	let slug = $derived(fields.slug.value() ?? data.project.slug);
	let dirty = $derived(name.trim() !== data.project.name || slug.trim() !== data.project.slug);
	// Keep the slug following the name until the slug is edited by hand.
	let slugTouched = $state(false);
</script>

<svelte:head>
	<title>{data.project.name} — Stem Shovel</title>
</svelte:head>

<main class="page-x-padding pt-6 mb-2">
	<header class="flex flex-wrap items-baseline justify-start gap-4 mb-5">
		<!-- <div class="flex gap-2">
			<a class="text-sm opacity-80 hover-underline underline-offset-4 hover-opacity-100 hover-text-accent" title="back to all projects" href="/{data.account.slug}/projects">Project</a> -->
		<h1 class="heading-1">{data.project.name}</h1>
		<span class="opacity-90 text-15px">a project from {data.account.name}</span>
		<!-- </div> -->
		{#if data.canEdit}
			<button
				class="text-sm link-dim"
				type="button"
				aria-expanded={open}
				onclick={() => (open = !open)}
			>
				{open ? "Close settings" : "Settings"}
			</button>
		{/if}
	</header>

	{#if open}
		<form
			class="mb-8 surface px-4 py-4"
			{...updateProject.enhance(async ({ submit }) => {
				saved = false;
				await submit();
				if (!fields.allIssues()) {
					saved = true;
					open = false;
				}
			})}
		>
			<input {...fields.id.as("hidden", data.project.id)} />
			<div class="grid gap-4 sm:grid-cols-2">
				<label class="block">
					<span class="text-sm text-dim">Name</span>
					<input
						class="mt-1 field"
						{...fields.name.as("text", data.project.name)}
						oninput={(e) => {
							if (!slugTouched) fields.slug.set(slugify(e.currentTarget.value));
						}}
						required
					/>
					{#each fields.name.issues() ?? [] as issue (issue.message)}
						<p class="mt-1 text-sm text-red-400">{issue.message}</p>
					{/each}
				</label>
				<label class="block">
					<span class="text-sm text-dim">URL</span>
					<span class="mt-1 flex items-center rounded border border-white/15 bg-black/20">
						<span class="pl-3 text-sm text-dim">/{data.account.slug}/projects/</span>
						<input
							class="block w-full bg-transparent py-2 pr-3 font-mono text-sm"
							{...fields.slug.as("text", data.project.slug)}
							oninput={() => (slugTouched = true)}
							required
						/>
					</span>
					{#each fields.slug.issues() ?? [] as issue (issue.message)}
						<p class="mt-1 text-sm text-red-400">{issue.message}</p>
					{/each}
					{#if slug !== slugify(name)}
						<button
							class="mt-1 text-xs link-dim"
							type="button"
							onclick={() => {
								fields.slug.set(slugify(name));
								slugTouched = false;
							}}>Use name</button
						>
					{/if}
				</label>
			</div>
			{#if slug.trim() !== data.project.slug}
				<p class="mt-2 text-xs text-dim">
					Changing the URL also moves every song under it. Old links stop working.
				</p>
			{/if}
			<div class="mt-4 flex items-center gap-3">
				<button
					class="button-accent disabled:opacity-40"
					disabled={!dirty || !!updateProject.pending}
				>
					{updateProject.pending ? "Saving…" : "Save"}
				</button>
			</div>
		</form>
	{:else if saved}
		<p class="mb-6 text-sm text-dim">Saved.</p>
	{/if}

	<div class="mb-8">
		<ProjectPlayer
			bind:this={player}
			songs={data.project.songs}
			bind:current={playing}
			bind:paused
		/>
	</div>

	<div class="flex flex-wrap items-center justify-between gap-3 mb-3">
		<div>
			<h2 class="opacity-90 text-18px font-700 leading-none text-nowrap mb-1">Songs in Progress</h2>
			<p class="opacity-90 text-15px">
				Listen here or click on a song name below to view and edit its stems, chart, lyrics etc.
			</p>
		</div>
		{#if data.canEdit}
			<button
				class="button button-sm"
				type="button"
				popovertarget="add-song"
				title="Add a song to this project"
			>
				<span class="i-ph-plus" aria-hidden="true"></span>
				Add Song
			</button>
		{/if}
	</div>

	{#if data.project.songs.length === 0}
		<p class="text-dim">
			No songs yet.{#if data.canEdit}
				<button class="ml-1 link-dim" type="button" popovertarget="add-song"
					>Add the first one.</button
				>
			{/if}
		</p>
	{:else}
		<ul class="grid grid-cols-1 gap-3">
			{#each data.project.songs as song (song.id)}
				{@const ready = song.stems.filter((s) => s.status === "ready").length}
				<li class="grid grid-cols-[auto_1fr] gap-3">
					<button
						type="button"
						class="shrink-0 grid w-12 place-items-center rounded-md border border-white/15 bg-blue-300/5 hover-bg-white/10 hover-text-accent disabled:opacity-30"
						aria-label={playing === song.id && !paused
							? `Pause ${song.title}`
							: `Play ${song.title}`}
						title={song.mixUrl ? "Play the mix" : "No mix yet"}
						disabled={!song.mixUrl}
						onclick={() => player?.play(song.id)}
					>
						<span
							class={playing === song.id && !paused ? "i-ph-pause-fill" : "i-ph-play-fill"}
							aria-hidden="true"
						></span>
					</button>
					<a
						class="list-tile grow flex justify-between items-baseline group !mb-0"
						href="/{data.account.slug}/projects/{data.project.slug}/{song.slug}"
					>
						<div>
							<span class="text-20px">{song.title}</span>
							{#if song.description}
								<span class="block text-sm">{song.description}</span>
							{/if}
						</div>
						<span
							class="shrink-0 text-sm opacity-90 text-offWhite font-400 group-hover-opacity-100"
						>
							{ready}
							{ready === 1 ? "stem" : "stems"}{#if song.durationSeconds}, {formatTime(
									song.durationSeconds,
								)}{/if}
						</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}

	{#if data.canEdit}
		<!-- Same native popover as the song settings: top layer, Esc / click-outside close. -->
		<div
			id="add-song"
			popover="auto"
			bind:this={addSongPanel}
			class="m-auto max-h-[calc(100vh-2rem)] overflow-y-auto w-[min(32rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
		>
			<div class="mb-4 flex items-center justify-between gap-4">
				<h2 class="heading-2 mb-0">Add a song</h2>
				<button
					class="button button-xs"
					type="button"
					popovertarget="add-song"
					popovertargetaction="hide"
				>
					Close
				</button>
			</div>
			<form
				{...createSong.enhance(async ({ submit }) => {
					await submit();
					// The remote function redirects to the new song on success; only issues keep us here.
					if (!createSong.fields.allIssues()) addSongPanel?.hidePopover();
				})}
			>
				<input {...createSong.fields.projectId.as("hidden", data.project.id)} />
				<label class="block">
					<span class="text-sm text-dim">Title</span>
					<input
						class="mt-1 field"
						{...createSong.fields.title.as("text")}
						placeholder="Song title"
						autocomplete="off"
						required
					/>
					{#each createSong.fields.title.issues() ?? [] as issue (issue.message)}
						<p class="mt-1 text-sm text-red-400">{issue.message}</p>
					{/each}
				</label>
				<p class="mt-2 text-xs text-dim">
					You can add stems, a chart and lyrics on the song's page.
				</p>
				<div class="mt-4">
					<button class="button-accent disabled:opacity-40" disabled={!!createSong.pending}>
						{createSong.pending ? "Creating…" : "Create song"}
					</button>
				</div>
			</form>
		</div>
	{/if}
</main>
