<script lang="ts">
	import StemPlayer from "$lib/components/StemPlayer.svelte";
	import StemUploader, { type UploadJob } from "$lib/components/StemUploader.svelte";
	import { formatBytes } from "$lib/format";
	import type { StemEngine } from "$lib/audio/engine.svelte";
	import type { StemState } from "$lib/audio/types";

	import { slugify, STEM_ACCEPT } from "$lib/slug";
	import { postJson, type Reservation, saveAs, uploadStemFile } from "$lib/upload";
	import { deleteSong, deleteStem, renameStem, updateSong } from "$lib/remote/songs.remote";
	import { invalidateAll } from "$app/navigation";
	import { untrack } from "svelte";

	let { data } = $props();

	// Settings form (title, URL, description) on the updateSong remote form.
	let settingsPanel = $state<HTMLDivElement | null>(null);
	let settingsSaved = $state(false);
	const fields = updateSong.fields;
	let title = $derived(fields.title.value() ?? data.song.title);
	let slug = $derived(fields.slug.value() ?? data.song.slug);
	let description = $derived(fields.description.value() ?? data.song.description);
	let settingsDirty = $derived(
		title.trim() !== data.song.title ||
			slug.trim() !== data.song.slug ||
			description.trim() !== data.song.description,
	);
	let slugTouched = $state(false);

	// Chart / Lyrics toggle for the read view. Starts on whichever has content.
	const DOC_KINDS = ["chart", "lyrics"] as const;
	const DOC_LABELS = { chart: "Chart", lyrics: "Lyrics" } as const;
	let doc = $state<(typeof DOC_KINDS)[number]>(
		untrack(() => (!data.docs.chart && data.docs.lyrics ? "lyrics" : "chart")),
	);

	let pending = $derived(data.song.stems.filter((s) => s.status !== "ready"));
	let uploadJobs = $state<UploadJob[]>([]);
	let uploadNotice = $state<string | null>(null);
	let ready = $derived(data.song.stems.filter((s) => s.status === "ready" && s.url));

	// "Upload new version" for one stem: same pipeline as adding, but the
	// reservation is /api/stems/[id]/replace, which keeps the row and label.
	let replacing = $state<Record<string, { percent: number; stage: string; error?: string }>>({});
	async function replaceStem(stemId: string, input: HTMLInputElement) {
		const file = input.files?.[0];
		input.value = "";
		if (!file) return;
		const ctx = new AudioContext({ sampleRate: 32_000 });
		replacing[stemId] = { percent: 0, stage: "uploading" };
		try {
			await uploadStemFile(
				file,
				() =>
					postJson<Reservation>(`/api/stems/${stemId}/replace`, {
						filename: file.name,
						sizeBytes: file.size,
					}),
				{
					ctx,
					onProgress: (p) => (replacing[stemId] = { ...replacing[stemId], percent: p }),
					onDecoding: () => (replacing[stemId] = { ...replacing[stemId], stage: "decoding" }),
				},
			);
			delete replacing[stemId];
			await invalidateAll();
		} catch (err) {
			replacing[stemId] = { ...replacing[stemId], stage: "error", error: (err as Error).message };
		} finally {
			await ctx.close();
		}
	}

	// Rename from the row menu. A prompt keeps this one-click; the load refresh
	// carries the new label into the player without re-decoding (StemPlayer
	// relabels in place).
	async function rename(stemId: string, current: string) {
		const label = prompt("Stem name", current)?.trim();
		if (!label || label === current) return;
		await renameStem({ id: stemId, label });
		await invalidateAll();
	}

	// The database row behind a player stem (filename, size, url).
	let stemRows = $derived(new Map(data.song.stems.map((s) => [s.id, s])));

	// Download every ready stem as one zip, built in the browser from the Blob
	// files (they allow cross-origin reads). Stored, not compressed: audio
	// does not shrink and stored entries stream straight through.
	let zipping = $state<string | null>(null);

	// MP3 mixdown: "original" is every stem at unity (cached on the server);
	// "custom" is what the player has audible right now — mute, solo and faders.
	const MIX_MODES = ["original", "custom"] as const;
	const MIX_LABELS = { original: "Original", custom: "Custom" };
	let mixMode = $state<(typeof MIX_MODES)[number]>("original");
	let mixing = $state<string | null>(null);
	let mixError = $state<string | null>(null);
	async function downloadMix(engine?: StemEngine) {
		if (mixing) return;
		mixError = null;
		const params = new URLSearchParams();
		if (mixMode === "custom") {
			const mix = engine?.mix() ?? { stems: [], master: 1 };
			if (mix.stems.length === 0) {
				mixError = "Nothing is audible — unmute a stem first.";
				return;
			}
			params.set("stems", mix.stems.map((s) => `${s.id}:${s.gain.toFixed(3)}`).join(","));
			params.set("master", mix.master.toFixed(3));
		}
		const query = params.size ? `?${params}` : "";
		mixing = "Rendering…";
		try {
			await saveAs(
				`/api/songs/${data.song.id}/mix${query}`,
				`${data.song.project.slug}-${data.song.slug}-${mixMode === "custom" ? "custom-mix" : "mix"}.mp3`,
			);
		} catch (e) {
			mixError = e instanceof Error ? e.message : String(e);
		} finally {
			mixing = null;
		}
	}
	async function downloadAll() {
		if (ready.length === 0 || zipping) return;
		zipping = "Preparing…";
		try {
			const { downloadZip } = await import("client-zip");
			const seen = new Set<string>();
			const stems = ready;
			// Fetched lazily as the zip is written, one file at a time.
			async function* entries() {
				for (const s of stems) {
					let name = s.filename;
					if (seen.has(name)) name = `${s.label}-${name}`;
					seen.add(name);
					const res = await fetch(s.url);
					if (!res.ok) throw new Error(`${s.label}: ${res.status} ${res.statusText}`);
					yield { name, input: res };
				}
			}
			const blob = await downloadZip(entries()).blob();
			const a = document.createElement("a");
			a.href = URL.createObjectURL(blob);
			a.download = `${data.song.project.slug}-${data.song.slug}-stems.zip`;
			a.click();
			setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
		} finally {
			zipping = null;
		}
	}
</script>

<svelte:head>
	<title>{data.song.title} — Stem Shovel</title>
</svelte:head>

<main
	class="page-x-padding pt-6 mb-2 grid grid-cols-1 xl-grid-cols-2 gap-8"
	data-song-id={data.song.id}
>
	<!-- 1. header: title, description, song settings -->
	<header class="grid gap-3 col-span-full">
		<div class="flex flex-wrap items-baseline justify-between gap-4">
			<div class="flex flex-wrap items-baseline gap-4">
				<!-- <a class="text-sm link-dim" href="/{data.account.slug}/projects/{data.song.project.slug}"
					>{data.song.project.name}</a
				> -->
				<h1 class="heading-1">{data.song.title}</h1>
				<span class="opacity-90 text-15px"
					>a song in the <a
						class="underline underline-offset-2"
						href="/{data.account.slug}/projects/{data.song.project.slug}"
						>{data.song.project.name}</a
					>
					project from
					<a class="underline underline-offset-2" href="/{data.account.slug}/projects"
						>{data.account.name}</a
					></span
				>
				<!-- {#if data.song.description}
					<p class="mt-1 max-w-prose text-sm text-dim">{data.song.description}</p>
				{/if} -->
			</div>
			{#if data.canEdit}
				<button
					class="block hover-text-accent opacity-90 border border-transparent px-1 py-1 rounded hover-opacity-100"
					type="button"
					popovertarget="song-settings"
					title="Song settings"
					aria-label="Song settings"
				>
					<span class="block i-ph-gear"></span>
				</button>
			{/if}
		</div>
		{#if settingsSaved}
			<p class="text-sm text-dim">Saved.</p>
		{/if}
	</header>

	{#if data.canEdit}
		<!-- Settings as a native popover: top layer, light-dismiss, Esc closes. -->
		<div
			id="song-settings"
			popover="auto"
			bind:this={settingsPanel}
			class="m-auto w-[min(40rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
		>
			<div class="mb-4 flex items-center justify-between gap-4">
				<h2 class="heading-2 mb-0">Song settings</h2>
				<button
					class="button button-xs"
					type="button"
					popovertarget="song-settings"
					popovertargetaction="hide"
				>
					Close
				</button>
			</div>
			<form
				{...updateSong.enhance(async ({ submit }) => {
					settingsSaved = false;
					await submit();
					if (!fields.allIssues()) {
						settingsSaved = true;
						settingsPanel?.hidePopover();
					}
				})}
			>
				<input {...fields.id.as("hidden", data.song.id)} />
				<div class="grid gap-4 sm:grid-cols-2">
					<label class="block">
						<span class="text-sm text-dim">Title</span>
						<input
							class="mt-1 field"
							{...fields.title.as("text", data.song.title)}
							oninput={(e) => {
								if (!slugTouched) fields.slug.set(slugify(e.currentTarget.value));
							}}
							required
						/>
						{#each fields.title.issues() ?? [] as issue (issue.message)}
							<p class="mt-1 text-sm text-red-400">{issue.message}</p>
						{/each}
					</label>
					<label class="block">
						<span class="text-sm text-dim">URL</span>
						<span class="mt-1 flex items-center rounded border border-white/15 bg-black/20">
							<span class="truncate pl-3 text-sm text-dim">/projects/{data.song.project.slug}/</span
							>
							<input
								class="block w-full bg-transparent py-2 pr-3 font-mono text-sm"
								{...fields.slug.as("text", data.song.slug)}
								oninput={() => (slugTouched = true)}
								required
							/>
						</span>
						{#each fields.slug.issues() ?? [] as issue (issue.message)}
							<p class="mt-1 text-sm text-red-400">{issue.message}</p>
						{/each}
						{#if slug !== slugify(title)}
							<button
								class="mt-1 text-xs link-dim"
								type="button"
								onclick={() => {
									fields.slug.set(slugify(title));
									slugTouched = false;
								}}>Use title</button
							>
						{/if}
					</label>
					<label class="block sm:col-span-2">
						<span class="text-sm text-dim"
							>Description <span class="opacity-60">(optional)</span></span
						>
						<textarea
							class="mt-1 field text-sm"
							rows="3"
							{...fields.description.as("text", data.song.description)}></textarea>
						{#each fields.description.issues() ?? [] as issue (issue.message)}
							<p class="mt-1 text-sm text-red-400">{issue.message}</p>
						{/each}
					</label>
				</div>
				{#if slug.trim() !== data.song.slug}
					<p class="mt-2 text-xs text-dim">Changing the URL breaks existing links to this song.</p>
				{/if}
				<div class="mt-4">
					<button
						class="button-accent disabled:opacity-40"
						disabled={!settingsDirty || !!updateSong.pending}
					>
						{updateSong.pending ? "Saving…" : "Save"}
					</button>
				</div>
			</form>

			<div class="mt-8 border-t border-white/15 pt-4">
				<h3 class="text-15px font-700 text-red-400">Delete this song</h3>
				<p class="mt-1 text-sm text-dim">
					Removes the song, its chart and lyrics, and every stem file.
				</p>
				<form
					class="mt-3"
					{...deleteSong.enhance(async ({ submit }) => {
						if (!confirm(`Delete "${data.song.title}" and all of its stems?`)) return;
						await submit();
					})}
				>
					<input {...deleteSong.fields.id.as("hidden", data.song.id)} />
					<button
						class="button text-red-400 hover-bg-red-400 hover-text-oxford"
						disabled={!!deleteSong.pending}
					>
						<span class="i-ph-trash" aria-hidden="true"></span>
						{deleteSong.pending ? "Deleting…" : "Delete song"}
					</button>
				</form>
			</div>
		</div>
	{/if}

	<!-- 2. player: transport + waveforms, with the stem actions -->
	<section class="grid grid-cols-1 place-content-start" aria-label="Player">
		<!-- transport and waveforms -->
		{#if data.manifest.stems.length > 0}
			<div class="mb-5">
				<StemPlayer manifest={data.manifest} {stemMenu}>
					{#snippet errorHint()}
						A stem's file is missing from the Blob store. Remove it from its menu and upload it
						again.
					{/snippet}
				</StemPlayer>
			</div>
		{:else}
			<div class="flex flex-wrap items-center justify-between gap-4">
				<p class="text-sm text-dim">No stems yet.</p>
			</div>
		{/if}

		{@render headerExtras?.()}

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
								class="h-full {job.status === 'error' ? 'bg-red-400' : 'bg-maximumYellow'}"
								style:width="{job.percent}%"
							></div>
						</div>
						{#if job.error}<p class="mt-1 text-xs text-red-400">{job.error}</p>{/if}
					</li>
				{/each}
			</ul>
		{/if}

		{#if pending.length > 0}
			<ul class="mt-4 surface divide-y divide-white/10 text-sm" aria-label="Stems not ready">
				{#each pending as stem (stem.id)}
					{@const job = replacing[stem.id]}
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
										onchange={(e) => replaceStem(stem.id, e.currentTarget)}
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

	<!-- 3. chart & lyrics -->
	<section
		class="grid gap-2 grid-cols-1 place-content-[start_stretch] h-full max-w-full overflow-hidden grid-rows-1fr relative"
		aria-label="Chart and lyrics"
	>
		<!-- <div class="h-full relative"> -->
		{#if data.docs[doc]}
			<article
				class="h-full min-h-full bg-blue-300/5 chart-body border rounded-md border-current/40 px-6 pt-12 pb-8"
			>
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized server-side in renderMarkdown -->
				{@html data.docs[doc]}
			</article>
		{:else}
			<p
				class="h-full min-h-full bg-blue-300/5 chart-body border rounded-md border-current/40 px-6 pt-12 pb-8"
			>
				{doc === "chart" ? "No chart yet." : "No lyrics yet."}
			</p>
		{/if}
		<!-- tool bar  -->
		<div class="absolute top-2 right-3 mb-2 grid grid-cols-[auto_auto] place-content-end gap-4">
			<div
				class="flex overflow-hidden rounded border border-white/15 items-center"
				role="tablist"
				aria-label="Document"
			>
				{#each DOC_KINDS as kind, index (kind)}
					<button
						type="button"
						role="tab"
						aria-selected={doc === kind}
						class="{doc === kind
							? 'button button-xs bg-blue-300 text-oxford border-blue-300 hover-bg-blue-200 hover-border-blue-200'
							: 'button button-xs opacity-80 hover-bg-blue-200 hover-border-blue-200'} {index === 0
							? 'rounded-r-none border-r-none'
							: 'rounded-l-none'}"
						onclick={() => (doc = kind)}>{DOC_LABELS[kind]}</button
					>
				{/each}
			</div>
			<a
				class="button button-xs h-full {data.canEdit ? '' : 'hidden'}"
				href="/{data.account.slug}/projects/{data.song.project.slug}/{data.song.slug}/{doc}"
			>
				{@html data.docs[doc]
					? `<span class="i-ph-pencil"></span>`
					: `<span class="i-ph-plus"></span>`}
			</a>
		</div>
		<!-- </div> -->
	</section>
</main>

{#snippet headerExtras(engine?: StemEngine)}
	<div class="flex flex-wrap items-center gap-2">
		{#if data.canEdit}
			<StemUploader
				songId={data.song.id}
				stemCount={data.song.stems.length}
				bind:jobs={uploadJobs}
				bind:notice={uploadNotice}
			/>
		{/if}
		{#if ready.length > 0}
			<button
				class="button button-sm"
				type="button"
				disabled={!!zipping}
				onclick={downloadAll}
				title="Download all stems"
			>
				<span class="i-ph-download-simple" aria-hidden="true"></span>
				{zipping ?? "Download Stems"}
			</button>
			<span class="inline-flex items-center" role="group" aria-label="Download MP3">
				<button
					class="button button-sm rounded-r-none border-r-none"
					type="button"
					disabled={!!mixing}
					onclick={() => downloadMix(engine)}
					title={mixMode === "custom"
						? "Download an MP3 of what is audible now (mute, solo, faders)"
						: "Download an MP3 of the full mix"}
				>
					<span class="i-ph-music-notes-simple" aria-hidden="true"></span>
					{mixing ?? "Download MP3"}
				</button>
				{#each MIX_MODES as mode, index (mode)}
					<button
						type="button"
						role="radio"
						aria-checked={mixMode === mode}
						class="{mixMode === mode
							? 'button button-sm bg-blue-300 text-oxford border-blue-300 hover-bg-blue-200 hover-border-blue-200'
							: 'button button-sm opacity-80 hover-bg-blue-200 hover-border-blue-200'} rounded-l-none {index ===
						0
							? 'rounded-r-none border-r-none'
							: ''}"
						disabled={!!mixing}
						onclick={() => (mixMode = mode)}>{MIX_LABELS[mode]}</button
					>
				{/each}
			</span>
			{#if mixError}
				<p class="w-full text-sm text-red-400" role="alert">{mixError}</p>
			{/if}
		{/if}
	</div>
{/snippet}

{#snippet stemMenu(stem: StemState)}
	{@const row = stemRows.get(stem.id)}
	{@const job = replacing[stem.id]}
	{@const remove = deleteStem.for(stem.id)}
	{#if row}
		<details class="relative">
			<summary
				class="grid h-8 w-8 cursor-pointer list-none place-items-center rounded border border-white/25 text-lg leading-none hover:border-white/60 [&::-webkit-details-marker]:hidden"
				title="{stem.label}: options"
				aria-label="{stem.label}: options"
				><span class="i-ph-dots-three-bold" aria-hidden="true"></span></summary
			>
			<div
				class="absolute right-0 z-20 mt-1 w-56 rounded border border-white/15 bg-oxford-800 p-1 text-sm shadow-lg shadow-black/50"
			>
				<div class="truncate px-3 py-1.5 text-xs text-dim">
					{row.filename} · {formatBytes(row.sizeBytes)}
				</div>
				<button
					class="block w-full rounded px-3 py-1.5 text-left hover:bg-white/10"
					type="button"
					onclick={() => saveAs(row.url, row.filename)}
				>
					<span class="i-ph-download-simple mr-2" aria-hidden="true"></span>Download
				</button>
				{#if data.canEdit}
					<button
						class="block w-full rounded px-3 py-1.5 text-left hover:bg-white/10"
						type="button"
						onclick={() => rename(stem.id, stem.label)}
					>
						<span class="i-ph-pencil-simple mr-2" aria-hidden="true"></span>Rename
					</button>
					<label
						class="block w-full cursor-pointer rounded px-3 py-1.5 text-left hover:bg-white/10"
					>
						<span class="i-ph-upload-simple mr-2" aria-hidden="true"></span>{job
							? job.stage === "uploading"
								? `Uploading ${Math.round(job.percent)}%`
								: job.stage
							: "Upload new version"}
						<input
							class="sr-only"
							type="file"
							accept={STEM_ACCEPT}
							disabled={!!job}
							onchange={(e) => replaceStem(stem.id, e.currentTarget)}
						/>
					</label>
					<form
						{...remove.enhance(async ({ submit }) => {
							if (!confirm(`Remove "${stem.label}" and its file?`)) return;
							await submit();
						})}
					>
						<input {...remove.fields.id.as("hidden", stem.id)} />
						<button
							class="block w-full rounded px-3 py-1.5 text-left text-red-400 hover:bg-white/10"
							disabled={!!remove.pending}
						>
							<span class="i-ph-trash mr-2" aria-hidden="true"></span>{remove.pending
								? "Removing…"
								: "Remove"}
						</button>
					</form>
				{/if}
				{#if job?.error}<p class="px-3 py-1 text-xs text-red-400">{job.error}</p>{/if}
			</div>
		</details>
	{/if}
{/snippet}
