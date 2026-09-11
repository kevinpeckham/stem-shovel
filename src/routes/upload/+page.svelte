<script lang="ts">
	import { goto } from "$app/navigation";
	import { slugify, stemPathname, STEM_MAX_BYTES } from "$lib/slug";
	import { formatBytes } from "$lib/format";
	import { upload } from "@vercel/blob/client";

	interface Job {
		file: File;
		percent: number;
		status: "queued" | "uploading" | "done" | "error";
		error?: string;
	}

	let title = $state("");
	let files = $state<FileList | null>(null);
	let jobs = $state<Job[]>([]);
	let busy = $state(false);

	let slug = $derived(slugify(title));
	let picked = $derived(files ? Array.from(files) : []);
	let tooBig = $derived(picked.filter((f) => f.size > STEM_MAX_BYTES));
	let canSubmit = $derived(!busy && slug.length > 0 && picked.length > 0 && tooBig.length === 0);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!canSubmit) return;
		busy = true;
		jobs = picked.map((file) => ({ file, percent: 0, status: "queued" }));

		// Sequential keeps the progress readable and avoids saturating the uplink;
		// each file still goes browser → Blob directly, never through our server.
		let failed = 0;
		for (const job of jobs) {
			job.status = "uploading";
			try {
				await upload(stemPathname(slug, job.file.name), job.file, {
					access: "public",
					handleUploadUrl: "/api/upload",
					contentType: job.file.type || undefined,
					multipart: true,
					onUploadProgress: ({ percentage }) => (job.percent = percentage),
				});
				job.status = "done";
				job.percent = 100;
			} catch (err) {
				failed++;
				job.status = "error";
				job.error = (err as Error).message;
			}
		}

		busy = false;
		if (failed === 0) await goto(`/songs/${slug}`);
	}
</script>

<svelte:head>
	<title>Upload stems — Stem Shovel</title>
</svelte:head>

<main class="mx-auto max-w-4xl px-4 py-8">
	<header class="mb-6 flex items-baseline justify-between gap-4">
		<h1 class="text-xl font-semibold">Upload stems</h1>
		<a class="text-sm underline decoration-playhead underline-offset-4" href="/songs">All songs</a>
	</header>

	<form class="space-y-5" onsubmit={submit}>
		<label class="block">
			<span class="text-sm text-dim">Song title</span>
			<input
				class="mt-1 block w-full rounded border border-line bg-row px-3 py-2"
				type="text"
				bind:value={title}
				placeholder="Test loop in D"
				required
				disabled={busy}
			/>
			{#if slug}
				<span class="mt-1 block text-xs text-dim">Stored under <code>stems/{slug}/</code></span>
			{/if}
		</label>

		<label class="block">
			<span class="text-sm text-dim">Stem files (one per stem)</span>
			<input
				class="mt-1 block w-full text-sm"
				type="file"
				accept="audio/*,.wav,.flac,.mp3,.ogg,.opus,.m4a,.aif,.aiff"
				multiple
				required
				bind:files
				disabled={busy}
			/>
		</label>

		{#if tooBig.length > 0}
			<p class="text-sm text-solo">
				Over the {formatBytes(STEM_MAX_BYTES)} limit: {tooBig.map((f) => f.name).join(", ")}
			</p>
		{/if}

		<button
			class="rounded bg-ink px-4 py-2 text-panel disabled:opacity-40"
			type="submit"
			disabled={!canSubmit}
		>
			{busy
				? "Uploading…"
				: `Upload ${picked.length || ""} ${picked.length === 1 ? "stem" : "stems"}`}
		</button>
	</form>

	{#if jobs.length > 0}
		<ul class="mt-8 divide-y divide-line rounded-lg bg-row" aria-live="polite">
			{#each jobs as job (job.file.name)}
				<li class="px-4 py-3">
					<div class="flex items-baseline justify-between gap-4 text-sm">
						<span class="truncate">{job.file.name}</span>
						<span class="shrink-0 text-dim">
							{#if job.status === "error"}
								failed
							{:else if job.status === "done"}
								{formatBytes(job.file.size)}
							{:else if job.status === "uploading"}
								{Math.round(job.percent)}%
							{:else}
								queued
							{/if}
						</span>
					</div>
					<div class="mt-2 h-1 overflow-hidden rounded bg-panel">
						<div
							class="h-full {job.status === 'error' ? 'bg-solo' : 'bg-playhead'}"
							style:width="{job.percent}%"
						></div>
					</div>
					{#if job.error}
						<p class="mt-1 text-xs text-solo">{job.error}</p>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</main>
