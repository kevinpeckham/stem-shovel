<script lang="ts">
	import { invalidateAll } from "$app/navigation";
	import { computePeaks, PEAK_BINS } from "$lib/audio/peaks";
	import { formatBytes } from "$lib/format";
	import { STEM_MAX_BYTES } from "$lib/slug";
	import { upload } from "@vercel/blob/client";

	interface Props {
		songId: string;
	}

	interface Job {
		file: File;
		percent: number;
		status: "queued" | "uploading" | "decoding" | "done" | "error";
		error?: string;
	}

	let { songId }: Props = $props();

	let files = $state<FileList | null>(null);
	let jobs = $state<Job[]>([]);
	let busy = $state(false);

	let picked = $derived(files ? Array.from(files) : []);
	let tooBig = $derived(picked.filter((f) => f.size > STEM_MAX_BYTES));
	let canSubmit = $derived(!busy && picked.length > 0 && tooBig.length === 0);

	/**
	 * One stem = three round trips: reserve the row (/api/stems), send the
	 * bytes browser → Blob (token from /api/upload), then decode locally and
	 * report duration/channels/peaks (/api/stems/[id]/ready). Sequential keeps
	 * the progress readable and avoids saturating the uplink.
	 */
	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!canSubmit) return;
		busy = true;
		jobs = picked.map((file) => ({ file, percent: 0, status: "queued" }));

		const ctx = new AudioContext({ sampleRate: 32_000 });
		let failed = 0;
		for (const job of jobs) {
			try {
				job.status = "uploading";
				const reserve = await fetch("/api/stems", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						songId,
						filename: job.file.name,
						contentType: job.file.type || "application/octet-stream",
						sizeBytes: job.file.size,
					}),
				});
				if (!reserve.ok) throw new Error(await errorText(reserve));
				const { stemId, pathname } = (await reserve.json()) as {
					stemId: string;
					pathname: string;
				};

				const blob = await upload(pathname, job.file, {
					access: "public",
					handleUploadUrl: "/api/upload",
					contentType: job.file.type || undefined,
					multipart: true,
					onUploadProgress: ({ percentage }) => (job.percent = percentage),
				});

				job.status = "decoding";
				const buffer = await ctx.decodeAudioData(await job.file.arrayBuffer());
				const ready = await fetch(`/api/stems/${stemId}/ready`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						url: blob.url,
						durationSeconds: buffer.duration,
						channels: buffer.numberOfChannels,
						peaks: Array.from(computePeaks(buffer, PEAK_BINS)),
					}),
				});
				if (!ready.ok) throw new Error(await errorText(ready));
				job.status = "done";
				job.percent = 100;
			} catch (err) {
				failed++;
				job.status = "error";
				job.error = (err as Error).message;
			}
		}
		await ctx.close();
		busy = false;
		files = null;
		if (failed === 0) jobs = [];
		await invalidateAll();
	}

	async function errorText(res: Response): Promise<string> {
		try {
			const body = (await res.json()) as { message?: string; error?: string };
			return body.message ?? body.error ?? `${res.status} ${res.statusText}`;
		} catch {
			return `${res.status} ${res.statusText}`;
		}
	}
</script>

<form class="space-y-3" onsubmit={submit}>
	<label class="block">
		<span class="text-sm text-dim">Add stems (one file per stem)</span>
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
	<ul class="mt-4 divide-y divide-line rounded-lg bg-row" aria-live="polite">
		{#each jobs as job (job.file.name)}
			<li class="px-4 py-3">
				<div class="flex items-baseline justify-between gap-4 text-sm">
					<span class="truncate">{job.file.name}</span>
					<span class="shrink-0 text-dim">
						{#if job.status === "error"}
							failed
						{:else if job.status === "done"}
							{formatBytes(job.file.size)}
						{:else if job.status === "decoding"}
							decoding…
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
