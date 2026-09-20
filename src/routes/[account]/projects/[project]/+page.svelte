<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";
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
	import ImageUploader from "$lib/components/ImageUploader.svelte";
	import { artistLine } from "$lib/utils/artistLine";
	import { PROJECT_TYPES } from "$lib/val/ProjectTypeSchema";
	import { PROJECT_TYPE_LABELS, VARIOUS_ARTISTS_FROM } from "$lib/constants/projectTypes";
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
	let type = $derived(fields.type.value() ?? data.project.type);
	let dirty = $derived(
		name.trim() !== data.project.name ||
			slug.trim() !== data.project.slug ||
			type !== data.project.type,
	);
	// The project's artists are whoever performs its songs: one act on an album, many on a soundtrack.
	let performers = $derived([
		...new Set(
			data.project.songs.flatMap((s) =>
				s.credits.filter((c) => c.role === "performer" && c.artist).map((c) => c.artist.name),
			),
		),
	]);
	let artistsLine = $derived(
		performers.length >= VARIOUS_ARTISTS_FROM
			? "Various artists"
			: artistLine(performers) || data.account.name,
	);
	let subtitle = $derived(
		[data.project.type === "other" ? "" : PROJECT_TYPE_LABELS[data.project.type], artistsLine]
			.filter(Boolean)
			.join(" · "),
	);
	// Keep the slug following the name until the slug is edited by hand.
	let slugTouched = $state(false);

	// A song marked finished (song settings) is filed first. Otherwise it is
	// "in progress" once it has a stem that finished uploading; until then it
	// is an idea — a place for lyrics, a chart, notes and demos.
	const readyStems = (song: (typeof data.project.songs)[number]) =>
		song.stems.filter((s) => s.status === "ready").length;
	let finished = $derived(data.project.songs.filter((s) => s.isFinished));
	let inProgress = $derived(data.project.songs.filter((s) => !s.isFinished && readyStems(s) > 0));
	let ideas = $derived(data.project.songs.filter((s) => !s.isFinished && readyStems(s) === 0));
	/** The playlist: finished songs, then the ones in progress, as listed. */
	let playable = $derived([...finished, ...inProgress]);

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
	<title>{pageTitle(data.project.name)}</title>
</svelte:head>

<main class="page-x-padding pt-6 mb-2 pb-24">
	<header class="flex flex-wrap items-baseline justify-between justify-start gap-4 mb-5">
		<!-- <div class="flex gap-2">
			<a class="text-sm opacity-80 hover-underline underline-offset-4 hover-opacity-100 hover-text-accent" title="back to all projects" href="/{data.account.slug}/projects">Project</a> -->
		<div class="">
			{#if data.project.imageUrl}
				<img
					class="h-14 w-14 self-center rounded-md border border-white/15 object-cover"
					src={data.project.imageUrl}
					alt=""
				/>
			{/if}

			<!-- Project Title -->
			<h1 class="flex gap-4 items-center app-page-heading mb-2">
				{#if data.project.isPrivate}
					<span
						class="block h-33px i-ph-lock opacity-70"
						title="Private: members and viewing links only"
						aria-label="Private"
					></span>
				{/if}
				<span class="block mb-0">{data.project.name}</span>

				{#if data.project.status === "archived"}
					<div class="flex items-end h-full">
						<span
							class="ml-2 inline-block rounded border border-white/20 px-1.5 py-0.5 text-10px uppercase tracking-wider opacity-70"
							title="Archived: out of the projects list; restore it in settings">archived</span
						>
					</div>
				{/if}
			</h1>

			<!-- Artists / Account -->
			<div class="gap-4 items-center">
				<span class="opacity-90 text-15px"
					>a project from: <a
						class="underline hover-text-accent underline-offset-4"
						href="/{data.account.slug}/projects">{data.account.name}</a
					></span
				>
				{#if performers}<div
						class="text-15px font-400 opacity-90"
						aria-label="Artists"
						title={performers.length >= VARIOUS_ARTISTS_FROM ? performers.join(", ") : undefined}
					>
						aritst: {subtitle}
					</div>
				{/if}
			</div>
		</div>
		<!-- </div> -->
		{#if data.canEdit}
			<div class="flex gap-4 items-center mt-5">
				<button class="button sm-button-sm" type="button" popovertarget="add-song">
					<span class="i-ph-plus"></span>
					<span class="hidden sm-inline">Add Song</span>
				</button>

				<button
					class="button sm-button-sm"
					type="button"
					popovertarget="project-settings"
					title="Project settings"
					aria-label="Project settings"
				>
					<span class="block i-ph-gear"></span>
					<span class="hidden sm-inline">Project Settings</span>
				</button>
			</div>
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
			<div class="mb-5">
				<ImageUploader
					kind="project"
					id={data.project.id}
					url={data.project.imageUrl}
					label={data.project.name}
					size="h-24 w-24"
				/>
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
				<label class="mt-4 block sm:max-w-xs">
					<span class="text-sm text-dim">Type</span>
					<select class="mt-1 field" {...fields.type.as("select", data.project.type)}>
						{#each PROJECT_TYPES as t (t)}
							<option value={t}>{PROJECT_TYPE_LABELS[t]}</option>
						{/each}
					</select>
					<span class="mt-1 block text-13px text-dim">
						Shown under the name with the artists on its songs; "Other" shows no label.
					</span>
				</label>
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

	<section class="mt-10">
		<div class="mb-5">
			<h2 class="app-section-heading">Playlist</h2>
			<p class="opacity-90">Listen to a playlist of your current stem mixes.</p>
		</div>
		<ProjectPlayer bind:this={player} songs={playable} bind:current={playing} bind:paused />
	</section>

	<!-- finished songs -->
	{#if finished.length > 0}
		<section class="mt-10">
			<div class="mb-5">
				<h2 class="marketing-section-heading">Finished Songs</h2>
				<p class="opacity-90 text-15px">Done, and marked so in their settings.</p>
			</div>
			<ul class="grid grid-cols-1 gap-3 mb-10">
				{#each finished as song (song.id)}
					{@render songRow(song)}
				{/each}
			</ul>
		</section>
	{/if}

	<!-- no songs yet -->
	{#if inProgress.length === 0 && ideas.length === 0}
		<section class="mt-10">
			<div class="mb-5">
				<h2 class="app-section-heading">Songs</h2>
				<p class="app-section-subheading text-balance">No songs yet.</p>
			</div>
			{#if data.canEdit}
				<button class="button" type="button" popovertarget="add-song"
					><span class="i-ph-plus"></span>Add Song</button
				>
			{:else}
				<div>No songs yet.</div>
			{/if}
		</section>
	{/if}

	<!-- songs in progress -->
	{#if inProgress.length > 0}
		<section class="mt-10">
			<div class="mb-5">
				<h2 class="app-section-heading">Songs in Progress</h2>
				<p class="app-section-subheading text-balance">
					Listen here or click on a song name below to view and edit its stems, chart, lyrics etc.
				</p>
			</div>
			<ul class="grid grid-cols-1 gap-3">
				{#each inProgress as song (song.id)}
					{@render songRow(song)}
				{/each}
			</ul>
		</section>
	{/if}

	<!-- song ideas -->
	{#if ideas.length > 0 && !data.project.isPrivate}
		<section class="mt-10">
			<div class="mb-5">
				<h2 class="app-section-heading">Song Ideas</h2>
				<p class="app-section-subheading text-balance">
					Songs without stems yet: a place to gather lyrics, a chart, notes and demo recordings.
				</p>
			</div>
			<ul class="grid grid-cols-1 gap-3">
				{#each ideas as song (song.id)}
					<li>
						<a
							class="app-list-tile"
							href="/{data.account.slug}/projects/{data.project.slug}/{song.slug}"
						>
							<!-- title -->
							<div class="app-tile-heading">
								{#if song.isPrivate}
									<span
										class="i-ph-lock flex bg-accent opacity-70"
										title="Private"
										aria-label="Private"
									>
									</span>
								{/if}
								{song.title}
							</div>

							<!-- description -->
							{#if song.description}
								<div class="app-tile-text">{song.description}</div>
							{/if}

							<!-- metadata -->
							<div class="app-tile-meta">
								{gathered(song)}
							</div>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if data.canEdit && (inProgress.length > 0 || ideas.length > 0)}
		<div class="mt-10 flex flex-wrap items-center gap-3">
			<button class="button button-accent" type="button" popovertarget="add-song"
				><span class="i-ph-plus"></span>Add New Song</button
			>
			{#if data.canEdit}
				<a
					class="button"
					href="/{data.account.slug}/ideas/recorder"
					title="Idea recorder: record a riff, a melody or a demo, then make a song of it"
				>
					<span class="i-ph-record-fill text-red-500" aria-hidden="true"></span>
					Record Idea
				</a>
			{/if}
		</div>
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

{#snippet songRow(song: (typeof data.project.songs)[number])}
	{@const ready = readyStems(song)}
	<li class="grid grid-cols-[auto_1fr] gap-3 place-content-center w-full">
		<button
			type="button"
			class="shrink-0 grid w-12 h-auto place-items-center rounded-md border border-white/15 bg-blue-300/5 hover-bg-white/10 hover-text-accent disabled:opacity-30"
			aria-label={playing === song.id && !paused ? `Pause ${song.title}` : `Play ${song.title}`}
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
			class="app-list-tile w-full"
			href="/{data.account.slug}/projects/{data.project.slug}/{song.slug}"
		>
			<div>
				<div class="app-tile-heading">
					{#if song.isPrivate && !data.project.isPrivate}
						<span class="i-ph-lock flex bg-accent opacity-70" title="Private" aria-label="Private"
						></span>{/if}{song.title}
				</div>
				{#if song.description}
					<div class="app-tile-text">{song.description}</div>
				{/if}
			</div>

			<div class="app-tile-meta">
				v{song.version} · {ready}
				{ready === 1 ? "stem" : "stems"}{#if song.durationSeconds}, {formatTime(
						song.durationSeconds,
					)}{/if}
			</div>
		</a>
	</li>
{/snippet}
