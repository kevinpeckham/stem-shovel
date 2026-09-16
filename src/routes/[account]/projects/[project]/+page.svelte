<script lang="ts">
	import AiToggle from "$lib/components/AiToggle.svelte";
	import PrivacyToggle from "$lib/components/PrivacyToggle.svelte";
	import ProjectLifecycle from "$lib/components/ProjectLifecycle.svelte";
	import ProjectPlayer from "$lib/components/ProjectPlayer.svelte";
	import ShareLinks from "$lib/components/ShareLinks.svelte";
	import { formatTime } from "$lib/utils/formatTime";
	import { notify } from "$lib/state/notifications.svelte";
	import { clearForm } from "$lib/utils/clearForm";
	import { slugify } from "$lib/utils/slugify";
	import { updateProject } from "$lib/remote/projects.remote";
	import { createSong } from "$lib/remote/songs.remote";

	let { data } = $props();

	let settingsPanel = $state<HTMLDivElement | null>(null);
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

	// A song is "in progress" once it has a stem that finished uploading;
	// until then it is an idea — a place for lyrics, a chart, notes and demos.
	const readyStems = (song: (typeof data.project.songs)[number]) =>
		song.stems.filter((s) => s.status === "ready").length;
	let inProgress = $derived(data.project.songs.filter((s) => readyStems(s) > 0));
	let ideas = $derived(data.project.songs.filter((s) => readyStems(s) === 0));

	/** What an idea holds so far, for its tile. */
	function gathered(song: (typeof data.project.songs)[number]): string {
		const parts: string[] = [];
		if (song.lyricsMarkdown.trim()) parts.push("lyrics");
		if (song.chartMarkdown.trim()) parts.push("chart");
		if (song.notesMarkdown.trim()) parts.push("notes");
		const demos = song.demos.filter((d) => d.status === "ready").length;
		if (demos > 0) parts.push(`${demos} ${demos === 1 ? "demo" : "demos"}`);
		return parts.length ? parts.join(" · ") : "nothing yet";
	}
</script>

<svelte:head>
	<title>{data.project.name} — Stem Shovel</title>
</svelte:head>

<main class="page-x-padding pt-6 mb-2">
	<header class="flex flex-wrap items-baseline justify-start gap-4 mb-5">
		<!-- <div class="flex gap-2">
			<a class="text-sm opacity-80 hover-underline underline-offset-4 hover-opacity-100 hover-text-accent" title="back to all projects" href="/{data.account.slug}/projects">Project</a> -->
		<h1 class="heading-2">
			{#if data.project.isPrivate}
				<span
					class="i-ph-lock mr-1 inline-block align-[-3px] text-24px opacity-70"
					title="Private: members and viewing links only"
					aria-label="Private"
				></span>
			{/if}{data.project.name}{#if data.project.status === "archived"}
				<span
					class="ml-2 inline-block rounded border border-white/20 px-1.5 py-0.5 align-middle text-10px uppercase tracking-wider opacity-70"
					title="Archived: out of the projects list; restore it in settings">archived</span
				>{/if}
		</h1>
		<span class="opacity-90 text-15px">a project from {data.account.name}</span>
		<!-- </div> -->
		{#if data.canEdit}
			<button
				class="ml-auto block hover-text-accent opacity-90 border border-transparent px-1 py-1 rounded hover-opacity-100"
				type="button"
				popovertarget="project-settings"
				title="Project settings"
				aria-label="Project settings"
			>
				<span class="block i-ph-gear"></span>
			</button>
		{/if}
	</header>

	{#if data.canEdit}
		<!-- Same native popover as the song settings: top layer, Esc / click-outside close. -->
		<div
			id="project-settings"
			popover="auto"
			onbeforetoggle={(e) => {
				// Open on what is saved, not on what was last typed.
				if (e.newState === "open") {
					clearForm(updateProject);
					slugTouched = false;
				}
			}}
			bind:this={settingsPanel}
			class="m-auto max-h-[calc(100vh-2rem)] overflow-y-auto w-[min(40rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
		>
			<div class="mb-4 flex items-center justify-between gap-4">
				<h2 class="heading-2 mb-0">Project settings</h2>
				<button
					class="button button-xs"
					type="button"
					popovertarget="project-settings"
					popovertargetaction="hide"
				>
					Close
				</button>
			</div>
			<form
				{...updateProject.enhance(async ({ submit }) => {
					await submit();
					if (!fields.allIssues()) {
						notify("Project settings saved");
						settingsPanel?.hidePopover();
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
			<div class="mt-8 border-t border-white/15 pt-4">
				<AiToggle
					kind="project"
					id={data.project.id}
					noAi={data.project.noAi}
					canChange={data.canEdit}
				/>
			</div>
			<div class="mt-8 border-t border-white/15 pt-4">
				<PrivacyToggle
					kind="project"
					id={data.project.id}
					isPrivate={data.project.isPrivate}
					canChange={data.canEdit}
				/>
			</div>
			<div class="mt-8 border-t border-white/15 pt-4">
				<ShareLinks
					target={{ projectId: data.project.id }}
					links={data.shareLinks}
					path="/{data.account.slug}/projects/{data.project.slug}"
					isPrivate={data.project.isPrivate}
				/>
			</div>
			<ProjectLifecycle
				projectId={data.project.id}
				name={data.project.name}
				status={data.project.status}
				songCount={data.project.songs.length}
				canDelete={(data.memberships?.find((m) => m.accountId === data.account.id)?.role ?? "") in
					{ owner: 1, admin: 1 }}
			/>
		</div>
	{/if}

	<div class="mb-8">
		<ProjectPlayer bind:this={player} songs={inProgress} bind:current={playing} bind:paused />
	</div>

	<div class="flex flex-wrap items-center justify-between gap-3 mb-5 lg-mb-3">
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

	{#if inProgress.length === 0}
		<p class="text-dim">
			{#if data.project.songs.length === 0}
				No songs yet.{#if data.canEdit}
					<button class="ml-1 link-dim" type="button" popovertarget="add-song"
						>Add the first one.</button
					>
				{/if}
			{:else}
				No songs with stems yet. A song idea moves up here once a stem is uploaded.
			{/if}
		</p>
	{:else}
		<ul class="grid grid-cols-1 gap-3">
			{#each inProgress as song (song.id)}
				{@const ready = readyStems(song)}
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
							<span class=""
								>{#if song.isPrivate && !data.project.isPrivate}<span
										class="i-ph-lock mr-1 inline-block align-[-2px] opacity-70"
										title="Private"
										aria-label="Private"
									></span>{/if}{song.title}</span
							>
							{#if song.description}
								<span class="block text-sm">{song.description}</span>
							{/if}
						</div>
						<span
							class="shrink-0 text-sm opacity-90 text-offWhite font-400 group-hover-opacity-100"
						>
							v{song.version} · {ready}
							{ready === 1 ? "stem" : "stems"}{#if song.durationSeconds}, {formatTime(
									song.durationSeconds,
								)}{/if}
						</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}

	{#if ideas.length > 0 || data.canEdit}
		<div class="flex flex-wrap items-center justify-between gap-3 mt-10 mb-5 lg-mb-3">
			<div>
				<h2 class="opacity-90 text-18px font-700 leading-none text-nowrap mb-1">Song Ideas</h2>
				<p class="opacity-90 text-15px">
					Songs without stems yet: a place to gather lyrics, a chart, notes and demo recordings.
				</p>
			</div>
		</div>
		{#if ideas.length === 0}
			<p class="text-dim">
				No ideas waiting.{#if data.canEdit}
					<button class="ml-1 link-dim" type="button" popovertarget="add-song">Add one.</button>
				{/if}
			</p>
		{:else}
			<ul class="grid grid-cols-1 gap-3">
				{#each ideas as song (song.id)}
					<li>
						<a
							class="list-tile flex justify-between items-baseline group !mb-0"
							href="/{data.account.slug}/projects/{data.project.slug}/{song.slug}"
						>
							<div>
								<span
									>{#if song.isPrivate && !data.project.isPrivate}<span
											class="i-ph-lock mr-1 inline-block align-[-2px] opacity-70"
											title="Private"
											aria-label="Private"
										></span>{/if}{song.title}</span
								>
								{#if song.description}
									<span class="block text-sm">{song.description}</span>
								{/if}
							</div>
							<span
								class="shrink-0 text-sm opacity-90 text-offWhite font-400 group-hover-opacity-100"
							>
								{gathered(song)}
							</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}

	{#if data.canEdit}
		<!-- Same native popover as the song settings: top layer, Esc / click-outside close. -->
		<div
			id="add-song"
			popover="auto"
			onbeforetoggle={(e) => {
				if (e.newState === "open") clearForm(createSong);
			}}
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
					It starts as a song idea; add stems, a chart, lyrics, notes and demos on its page.
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
