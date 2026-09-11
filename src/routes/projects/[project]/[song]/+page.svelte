<script lang="ts">
	import StemPlayer from "$lib/components/StemPlayer.svelte";
	import StemUploader from "$lib/components/StemUploader.svelte";
	import { formatBytes } from "$lib/format";
	import type { StemState } from "$lib/audio/types";

	import { slugify, STEM_ACCEPT } from "$lib/slug";
	import { postJson, type Reservation, saveAs, uploadStemFile } from "$lib/upload";
	import { deleteSong, deleteStem, renameStem, updateSong } from "$lib/remote/songs.remote";
	import { invalidateAll } from "$app/navigation";
	import { untrack } from "svelte";

	let { data } = $props();

	// Settings form (title, URL, description) on the updateSong remote form.
	let settingsOpen = $state(false);
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

<main class="page" data-song-id={data.song.id}>
	<header class="flex flex-wrap items-baseline justify-between gap-4">
		<div>
			<a class="text-sm link-dim" href="/projects/{data.song.project.slug}"
				>{data.song.project.name}</a
			>
			<h1 class="display">{data.song.title}</h1>
			{#if data.song.description}
				<p class="mt-1 max-w-prose text-sm text-dim">{data.song.description}</p>
			{/if}
		</div>
		<button
			class="text-sm link-dim"
			type="button"
			aria-expanded={settingsOpen}
			onclick={() => (settingsOpen = !settingsOpen)}
		>
			{settingsOpen ? "Close settings" : "Settings"}
		</button>
		<form
			{...deleteSong.enhance(async ({ submit }) => {
				if (!confirm(`Delete "${data.song.title}" and all of its stems?`)) return;
				await submit();
			})}
		>
			<input {...deleteSong.fields.id.as("hidden", data.song.id)} />
			<button class="text-sm link-dim disabled:opacity-50" disabled={!!deleteSong.pending}>
				{deleteSong.pending ? "Deleting…" : "Delete song"}
			</button>
		</form>
	</header>

	{#if settingsOpen}
		<form
			class="mb-8 surface px-4 py-4"
			{...updateSong.enhance(async ({ submit }) => {
				settingsSaved = false;
				await submit();
				if (!fields.allIssues()) {
					settingsSaved = true;
					settingsOpen = false;
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
						<p class="mt-1 text-sm text-solo">{issue.message}</p>
					{/each}
				</label>
				<label class="block">
					<span class="text-sm text-dim">URL</span>
					<span class="mt-1 flex items-center rounded border border-white/15 bg-black/20">
						<span class="truncate pl-3 text-sm text-dim">/projects/{data.song.project.slug}/</span>
						<input
							class="block w-full bg-transparent py-2 pr-3 font-mono text-sm"
							{...fields.slug.as("text", data.song.slug)}
							oninput={() => (slugTouched = true)}
							required
						/>
					</span>
					{#each fields.slug.issues() ?? [] as issue (issue.message)}
						<p class="mt-1 text-sm text-solo">{issue.message}</p>
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
						<p class="mt-1 text-sm text-solo">{issue.message}</p>
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
	{:else if settingsSaved}
		<p class="mb-6 text-sm text-dim">Saved.</p>
	{/if}

	{#if data.manifest.stems.length > 0}
		<StemPlayer manifest={data.manifest} {stemMenu} {headerExtras}>
			{#snippet errorHint()}
				A stem's file is missing from the Blob store. Remove it from its menu and upload it again.
			{/snippet}
		</StemPlayer>
	{:else}
		<p class="text-sm text-dim">No stems yet. Upload some below.</p>
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
					</span>
					{#if job?.error}<p class="w-full text-xs text-solo">{job.error}</p>{/if}
				</li>
			{/each}
		</ul>
	{/if}

	<section class="mt-8" aria-label="Chart and lyrics">
		<div class="mb-2 flex items-baseline justify-between gap-4">
			<div
				class="flex overflow-hidden rounded border border-white/15 text-xs"
				role="tablist"
				aria-label="Document"
			>
				{#each DOC_KINDS as kind (kind)}
					<button
						type="button"
						role="tab"
						aria-selected={doc === kind}
						class={doc === kind ? "tab-active" : "tab-idle"}
						onclick={() => (doc = kind)}>{DOC_LABELS[kind]}</button
					>
				{/each}
			</div>
			<a class="text-sm link-dim" href="/projects/{data.song.project.slug}/{data.song.slug}/{doc}">
				{data.docs[doc]
					? `Edit ${DOC_LABELS[doc].toLowerCase()}`
					: `Add ${DOC_LABELS[doc].toLowerCase()}`}
			</a>
		</div>
		{#if data.docs[doc]}
			<article class="chart-body surface px-6 py-4">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized server-side in renderMarkdown -->
				{@html data.docs[doc]}
			</article>
		{:else}
			<p class="text-sm text-dim">
				{doc === "chart" ? "No chart yet. Chords and arrangement go here." : "No lyrics yet."}
			</p>
		{/if}
	</section>

	<section class="mt-8" aria-label="Upload">
		<StemUploader songId={data.song.id} stemCount={data.song.stems.length} />
	</section>
</main>

{#snippet headerExtras()}
	{#if ready.length > 0}
		<button
			class="text-sm link-dim disabled:opacity-50"
			type="button"
			disabled={!!zipping}
			onclick={downloadAll}
		>
			{zipping ?? `Download all (${ready.length} ${ready.length === 1 ? "stem" : "stems"}, .zip)`}
		</button>
	{/if}
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
				class="absolute right-0 z-20 mt-1 w-56 rounded border border-white/15 bg-oxfordDark p-1 text-sm shadow-lg shadow-black/50"
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
				<button
					class="block w-full rounded px-3 py-1.5 text-left hover:bg-white/10"
					type="button"
					onclick={() => rename(stem.id, stem.label)}
				>
					<span class="i-ph-pencil-simple mr-2" aria-hidden="true"></span>Rename
				</button>
				<label class="block w-full cursor-pointer rounded px-3 py-1.5 text-left hover:bg-white/10">
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
						class="block w-full rounded px-3 py-1.5 text-left text-solo hover:bg-white/10"
						disabled={!!remove.pending}
					>
						<span class="i-ph-trash mr-2" aria-hidden="true"></span>{remove.pending
							? "Removing…"
							: "Remove"}
					</button>
				</form>
				{#if job?.error}<p class="px-3 py-1 text-xs text-solo">{job.error}</p>{/if}
			</div>
		</details>
	{/if}
{/snippet}
