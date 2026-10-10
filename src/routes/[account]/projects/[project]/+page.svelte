<script lang="ts">
	import IconChat from "#lib/components/IconChat.svelte";
	import { pageTitle } from "#lib/utils/pageTitle.js";
	import AiToggle from "#lib/components/AiToggle.svelte";
	import PrivacyToggle from "#lib/components/PrivacyToggle.svelte";
	import ProjectLifecycle from "#lib/components/ProjectLifecycle.svelte";
	import SongFilesPanel from "#lib/components/SongFilesPanel.svelte";
	import { downloadBuilt } from "#lib/utils/downloadBuilt.js";
	import ProjectPlayer from "#lib/components/ProjectPlayer.svelte";
	import ShareLinks from "#lib/components/ShareLinks.svelte";
	import ProjectPeople from "#lib/components/ProjectPeople.svelte";
	import { formatTime } from "#lib/utils/formatTime.js";
	import { songStage } from "#lib/utils/songStage.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { clearForm } from "#lib/utils/clearForm.js";
	import { slugify } from "#lib/utils/slugify.js";
	import { reorderSongs, updateProject } from "#lib/remote/projects.remote.js";
	import { dropIndexAt } from "#lib/utils/dropIndexAt.js";
	import { moveId } from "#lib/utils/moveId.js";
	import { reorderById } from "#lib/utils/reorderById.js";
	import { reorderWithinGroup } from "#lib/utils/reorderWithinGroup.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import { refreshAll } from "$app/navigation";
	import ImageUploader from "#lib/components/ImageUploader.svelte";
	import { artistLine } from "#lib/utils/artistLine.js";
	import { PROJECT_TYPES } from "#lib/val/ProjectTypeSchema.js";
	import { PROJECT_TYPE_LABELS, VARIOUS_ARTISTS_FROM } from "#lib/constants/projectTypes.js";
	import { createSong } from "#lib/remote/songs.remote.js";

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

	// A song marked finished (song settings) is filed first. Otherwise it is
	// "in progress" once it has a stem that finished uploading, or a mix
	// (docs/mixes.md; Kevin: a mixing stage counts); until then it is an
	// idea — a place for lyrics, a chart, notes and demos.
	const readyStems = (song: (typeof data.project.songs)[number]) =>
		song.stems.filter((s) => s.status === "ready").length;
	/** The song's stage (docs/mixes.md, "Phase 2"): set in settings, else read from what it holds. */
	const stageOf = (song: (typeof data.project.songs)[number]) =>
		songStage({
			stage: song.stage,
			isFinished: song.isFinished,
			hasMix: song.mixCount > 0,
			hasStem: readyStems(song) > 0,
		});
	// The songs in the order the page shows: the project's, or the one a member is dragging into shape until it is saved.
	let songOrder = $state<string[] | null>(null);
	let songs = $derived(songOrder ? reorderById(data.project.songs, songOrder) : data.project.songs);
	// Filed by stage (docs/mixes.md, "Phase 2"): finished, then mixing, arranging and writing (the song ideas); an empty stage shows no section.
	let finished = $derived(songs.filter((s) => stageOf(s) === "finished"));
	let mixing = $derived(songs.filter((s) => stageOf(s) === "mixing"));
	let arranging = $derived(songs.filter((s) => stageOf(s) === "arranging"));
	let ideas = $derived(songs.filter((s) => stageOf(s) === "writing"));
	let inProgress = $derived([...mixing, ...arranging]);
	type Song = (typeof data.project.songs)[number];
	const groupOf = (song: Song) => stageOf(song);
	const groupIds = (group: string) =>
		(group === "finished"
			? finished
			: group === "mixing"
				? mixing
				: group === "arranging"
					? arranging
					: ideas
		).map((s) => s.id);

	// Reordering within a list: a grip is dragged (pointer events, so touch works and
	// the page does not scroll under it) or moved with the arrow keys; the lists follow
	// live, and the order is saved once the move is done. One order runs across the
	// three lists (reorderWithinGroup), so the other lists never shift.
	let dragging = $state<{ id: string; group: string } | null>(null);
	let orderAtStart: string[] = [];
	const order = () => songs.map((s) => s.id);
	function moveWithin(song: Song, index: number) {
		const group = groupOf(song);
		songOrder = reorderWithinGroup(order(), moveId(groupIds(group), song.id, index));
	}
	async function commit() {
		const ids = order();
		if (!ids.some((id, i) => id !== orderAtStart[i])) return;
		try {
			await reorderSongs({ projectId: data.project.id, ids });
			await refreshAll();
			notify("Song order saved");
		} catch (e) {
			notify(`Could not save the song order: ${errorMessage(e)}`, { kind: "error" });
		}
		songOrder = null;
	}
	function gripDown(e: PointerEvent, song: Song) {
		if (e.button !== 0) return;
		e.preventDefault();
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		dragging = { id: song.id, group: groupOf(song) };
		orderAtStart = order();
	}
	function gripMove(e: PointerEvent, song: Song) {
		if (dragging?.id !== song.id) return;
		const rows = [
			...document.querySelectorAll<HTMLElement>(
				`[data-song-group="${dragging.group}"] [data-song-row]`,
			),
		];
		const index = dropIndexAt(
			rows.map((r) => r.getBoundingClientRect()),
			e.clientY,
		);
		if (groupIds(dragging.group).indexOf(song.id) !== index) moveWithin(song, index);
	}
	function gripUp() {
		if (!dragging) return;
		dragging = null;
		void commit();
	}
	function gripKey(e: KeyboardEvent, song: Song) {
		if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
		e.preventDefault();
		orderAtStart = order();
		const from = groupIds(groupOf(song)).indexOf(song.id);
		moveWithin(song, from + (e.key === "ArrowUp" ? -1 : 1));
		void commit();
	}
	/** What a song plays here (docs/mixes.md): by its stage, the newest mix in mixing or finished, the stems' bounce in arranging, either as a fallback; and what to call it. */
	const playOf = (song: (typeof data.project.songs)[number]) => {
		const mix = song.latestMix
			? { url: song.latestMix.playUrl, source: `Mix v${song.latestMix.version}` }
			: null;
		const bounce = song.mixUrl ? { url: song.mixUrl, source: "Stems mix" } : null;
		const s = stageOf(song);
		return s === "mixing" || s === "finished" ? (mix ?? bounce) : (bounce ?? mix);
	};
	/** The playlist: the sections' order (finished, mixing, arranging), each song with its newest mix or its stems' bounce. */
	let playable = $derived(
		[...finished, ...inProgress].map((song) => {
			const play = playOf(song);
			return { id: song.id, title: song.title, mixUrl: play?.url ?? null, source: play?.source };
		}),
	);
	/** The demos playlist: every song's ready recordings in the songs' order, each named by its song; the ideas' are the default scope (Kevin: as the Song Ideas section). */
	let demoTracks = $derived(
		[...finished, ...inProgress, ...ideas].flatMap((song) =>
			song.demos
				.filter((d) => d.status === "ready" && d.playUrl)
				.map((d) => ({
					id: d.id,
					title: `${song.title} · ${d.label}`,
					mixUrl: d.playUrl,
					idea: stageOf(song) === "writing",
				})),
		),
	);

	/** What a song holds beside its stems, for its tile (Kevin: the charts and the notes counted). */
	function gathered(song: (typeof data.project.songs)[number], withLyrics = true): string {
		const parts: string[] = [];
		if (withLyrics && song.lyricsMarkdown.trim()) parts.push("lyrics");
		const charts = chartCount(song);
		if (charts > 0) parts.push(`${charts} ${charts === 1 ? "chart" : "charts"}`);
		const notes = noteCount(song);
		if (notes > 0) parts.push(`${notes} ${notes === 1 ? "note" : "notes"}`);
		const demos = song.demos.filter((d) => d.status === "ready").length;
		if (demos > 0) parts.push(`${demos} ${demos === 1 ? "demo" : "demos"}`);
		if (song.mixCount > 0) parts.push(`${song.mixCount} ${song.mixCount === 1 ? "mix" : "mixes"}`);
		if (song.chat && song.chat.count > 0)
			parts.push(`${song.chat.count} ${song.chat.count === 1 ? "message" : "messages"}`);
		return parts.length ? parts.join(" · ") : withLyrics ? "nothing yet" : "";
	}
	/** The chart text counts one, and every score and chart file attached counts one. */
	const chartCount = (song: (typeof data.project.songs)[number]) =>
		(song.chartMarkdown.trim() ? 1 : 0) + song.chartFiles;
	/** The project's notes count one, and the viewer's own private note on the song one. */
	const noteCount = (song: (typeof data.project.songs)[number]) =>
		(song.notesMarkdown.trim() ? 1 : 0) + (song.hasMyNote ? 1 : 0);
	/** The downloads offer what exists: charts (scores, chart files, chart text) and documentation (any text). */
	let hasCharts = $derived(
		data.scores.length > 0 ||
			data.files.some((f) => f.isNotation) ||
			songs.some((s) => s.chartMarkdown.trim()),
	);
	let hasDocumentation = $derived(
		songs.some((s) => s.chartMarkdown.trim() || s.lyricsMarkdown.trim() || s.notesMarkdown.trim()),
	);
	/** An idea's first demo, for its tile's play button. */
	const firstDemo = (song: (typeof data.project.songs)[number]) =>
		song.demos.find((d) => d.status === "ready" && d.playUrl) ?? null;
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
						artist: {subtitle}
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
						<input class="mt-1 field" {...fields.name.as("text", data.project.name)} required />
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
								required
							/>
						</span>
						{#each fields.slug.issues() ?? [] as issue (issue.message)}
							<p class="mt-1 text-sm text-red-400">{issue.message}</p>
						{/each}
						<span class="mt-1 block text-xs text-dim"
							>Change it and the old address keeps working as a redirect.</span
						>
						{#if slug !== slugify(name)}
							<button
								class="mt-1 text-xs link-dim"
								type="button"
								onclick={() => {
									fields.slug.set(slugify(name));
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
					isPrivate={data.project.isPrivate}
				/>
			</div>
			<div class="mt-8 border-t border-white/15 pt-4">
				<ProjectPeople
					projectId={data.project.id}
					projectName={data.project.name}
					isRestricted={data.project.isRestricted}
					people={data.people}
					invitations={data.invitations}
					accountMembers={data.accountMembers}
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
			<p class="opacity-90 max-w-prose">
				Listen to each song's newest mix, or its stems mixed down where no mix has been uploaded
				yet, or to the songs' demo recordings.
			</p>
		</div>
		<ProjectPlayer
			bind:this={player}
			songs={playable}
			demos={demoTracks}
			bind:current={playing}
			bind:paused
		/>
	</section>

	<!-- finished songs -->
	{@render stageSection(
		"finished",
		finished,
		"Finished Songs",
		"Done: everything still plays and stays editable.",
	)}

	<!-- no songs yet -->
	{#if inProgress.length === 0 && ideas.length === 0}
		<section class="mt-10">
			<div class="mb-5">
				<h2 class="app-section-heading">Songs</h2>
				<p class="app-section-subheading text-balance max-w-prose">No songs yet.</p>
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

	<!-- the songs under way, by stage: mixing, then arranging (docs/mixes.md, "Phase 2") -->
	{@render stageSection(
		"mixing",
		mixing,
		"Mixing",
		"The engineer's mixes for the band's feedback. Listen here, or open a song for its mixes, chart and lyrics.",
	)}
	{@render stageSection(
		"arranging",
		arranging,
		"Arranging",
		"Stems to play along with and build on. Listen here, or open a song to work on its stems, chart, lyrics etc.",
	)}

	<!-- song ideas -->
	{#if ideas.length > 0 && !data.project.isPrivate}
		<section class="mt-10">
			<div class="mb-5">
				<h2 class="app-section-heading">Song Ideas</h2>
				<p class="app-section-subheading text-balance max-w-prose">
					Songs without stems yet: a place to gather lyrics, a chart, notes and demo recordings.
					Click a song's name below to open it and add to it.
				</p>
			</div>
			<ul class="grid grid-cols-1 gap-3 {dragging ? 'select-none' : ''}" data-song-group="ideas">
				{#each ideas as song (song.id)}
					{@const demo = firstDemo(song)}
					<li
						class="flex items-stretch gap-3 w-full {dragging?.id === song.id ? 'opacity-50' : ''}"
						data-song-row={song.id}
					>
						{#if data.canEdit}{@render grip(song)}{/if}
						<!-- An idea plays its demo, as a song plays its mix (Kevin). -->
						<button
							type="button"
							class="shrink-0 grid w-12 h-auto place-items-center rounded-md border border-white/15 bg-blue-300/5 hover-bg-white/10 hover-text-accent disabled:opacity-30"
							aria-label={demo && playing === demo.id && !paused
								? `Pause the demo of ${song.title}`
								: `Play the demo of ${song.title}`}
							title={demo ? "Play the demo" : "No demo yet"}
							disabled={!demo}
							onclick={() => demo && player?.play(demo.id)}
						>
							<span
								class={demo && playing === demo.id && !paused
									? "i-ph-pause-fill"
									: "i-ph-play-fill"}
								aria-hidden="true"
							></span>
						</button>
						<a
							class="app-list-tile w-full relative pr-10"
							href="/{data.account.slug}/projects/{data.project.slug}/{song.slug}"
							title="Open the song"
						>
							{@render opens()}
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
						{@render chatBadge(song)}
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<!-- Attachments & Downloads (Kevin): every song's files and scores plus the project's own, and the documentation downloads. Shown when there is something, and to editors so the first file can be added. -->
	{#if data.files.length > 0 || data.scores.length > 0 || data.canEdit}
		<section class="mt-10">
			<div class="mb-5">
				<h2 class="marketing-section-heading">Attachments &amp; Downloads</h2>
				<p class="opacity-90 text-15px max-w-prose">
					Notation, audio scraps and other documents attached to the project or its songs, and the
					project's documentation to take away. A song's lyrics, chart text and notes have no tile
					here: open the song to read them, or take them all in the documentation download.
				</p>
			</div>
			{#if hasCharts || hasDocumentation}
				<div class="flex flex-wrap items-center gap-3">
					{#if hasCharts}
						<button
							class="button button-sm"
							type="button"
							title="Every song's scores (with their rendered PDFs and MusicXML), chart files and chart text, in one zip"
							onclick={() =>
								downloadBuilt(
									`/api/projects/${data.project.id}/charts.zip`,
									"the charts zip",
									`${data.project.name} charts.zip`,
								)}
						>
							<span class="i-ph-file-zip" aria-hidden="true"></span>
							Download All Charts
						</button>
					{/if}
					{#if hasDocumentation}
						<button
							class="button button-sm"
							type="button"
							title="A PDF per song with its lyrics, chart and notes, in one zip"
							onclick={() =>
								downloadBuilt(
									`/api/projects/${data.project.id}/documentation.zip`,
									"the documentation zip",
									`${data.project.name} documentation.zip`,
								)}
						>
							<span class="i-ph-file-zip" aria-hidden="true"></span>
							Download All Song Documentation
						</button>
					{/if}
				</div>
			{/if}
			<hr class="my-8 border-current/20" />
			<SongFilesPanel
				projectId={data.project.id}
				songTitle={data.project.name}
				files={data.files}
				scores={data.scores}
				canEdit={data.canEdit}
				songs={songs.map((s) => ({ id: s.id, title: s.title, slug: s.slug }))}
				songHref={(song) => `/${data.account.slug}/projects/${data.project.slug}/${song.slug}`}
			/>
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
					href="/ideas/recorder"
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

{#snippet grip(song: Song)}
	<button
		class="shrink-0 self-center cursor-grab touch-none rounded px-0.5 py-2 opacity-50 hover-opacity-100 focus-visible-opacity-100 {dragging?.id ===
		song.id
			? 'cursor-grabbing opacity-100'
			: ''}"
		type="button"
		aria-label="Move {song.title}"
		title="Drag to reorder, or use the arrow keys"
		onpointerdown={(e) => gripDown(e, song)}
		onpointermove={(e) => gripMove(e, song)}
		onpointerup={gripUp}
		onpointercancel={gripUp}
		onkeydown={(e) => gripKey(e, song)}
	>
		<span class="i-ph-dots-six-vertical block text-18px" aria-hidden="true"></span>
	</button>
{/snippet}

{#snippet opens()}
	<!-- The tile opens the song page (Kevin: say so). -->
	<span class="i-ph-arrow-up-right absolute top-3 right-3 text-16px opacity-50" aria-hidden="true"
	></span>
{/snippet}

{#snippet stageSection(group: string, list: Song[], heading: string, blurb: string)}
	{#if list.length > 0}
		<section class="mt-10">
			<div class="mb-5">
				<h2 class="app-section-heading">{heading}</h2>
				<p class="app-section-subheading text-balance max-w-prose">{blurb}</p>
			</div>
			<ul class="grid grid-cols-1 gap-3 {dragging ? 'select-none' : ''}" data-song-group={group}>
				{#each list as song (song.id)}
					{@render songRow(song)}
				{/each}
			</ul>
		</section>
	{/if}
{/snippet}

{#snippet songRow(song: Song)}
	{@const ready = readyStems(song)}
	{@const play = playOf(song)}
	<li
		class="flex items-stretch gap-3 w-full {dragging ? 'select-none' : ''} {dragging?.id === song.id
			? 'opacity-50'
			: ''}"
		data-song-row={song.id}
	>
		{#if data.canEdit}{@render grip(song)}{/if}
		<button
			type="button"
			class="shrink-0 grid w-12 h-auto place-items-center rounded-md border border-white/15 bg-blue-300/5 hover-bg-white/10 hover-text-accent disabled:opacity-30"
			aria-label={playing === song.id && !paused ? `Pause ${song.title}` : `Play ${song.title}`}
			title={play
				? `Play ${play.source === "Stems mix" ? "the stems mix" : play.source}`
				: "No mix yet"}
			disabled={!play}
			onclick={() => player?.play(song.id)}
		>
			<span
				class={playing === song.id && !paused ? "i-ph-pause-fill" : "i-ph-play-fill"}
				aria-hidden="true"
			></span>
		</button>

		<a
			class="app-list-tile w-full relative pr-10"
			href="/{data.account.slug}/projects/{data.project.slug}/{song.slug}"
			title="Open the song"
		>
			{@render opens()}
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
				v{song.version} · {ready === 0
					? "no stems"
					: `${ready} ${ready === 1 ? "stem" : "stems"}`}{#if song.durationSeconds}, {formatTime(
						song.durationSeconds,
					)}{/if}{#if gathered(song, false)}{" · "}{gathered(song, false)}{/if}
			</div>
		</a>
		{@render chatBadge(song)}
	</li>
{/snippet}

{#snippet chatBadge(song: Song)}
	<!-- Unread chat (docs/chat.md): a badge that opens the song with its chat panel up. -->
	{#if song.chat && song.chat.unread > 0}
		<a
			class="shrink-0 self-center flex items-center gap-1 rounded-full border border-accent/60 bg-accent/10 px-2 py-1 text-12px text-accent hover-bg-accent/20"
			href="/{data.account.slug}/projects/{data.project.slug}/{song.slug}?open=chat"
			title="{song.chat.unread} new {song.chat.unread === 1 ? 'message' : 'messages'} in the chat"
			aria-label="{song.chat.unread} new {song.chat.unread === 1
				? 'message'
				: 'messages'} in the chat on {song.title}"
			data-chat-badge
		>
			<IconChat />{song.chat.unread}
		</a>
	{/if}
{/snippet}
