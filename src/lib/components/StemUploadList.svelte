<script lang="ts">
	import type { StemUploads } from "#lib/state/stemUploads.svelte.js";
	import { formatBytes } from "#lib/utils/formatBytes.js";

	interface Props {
		uploads: StemUploads;
	}
	let { uploads }: Props = $props();
	type UploadJob = StemUploads["jobs"][number];
</script>

{#snippet row(job: UploadJob)}
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
				class="h-full {job.status === 'error' ? 'bg-red-400' : 'bg-accent'}"
				style:width="{job.percent}%"
			></div>
		</div>
		{#if job.error}<p class="mt-1 text-xs text-red-400">{job.error}</p>{/if}
	</li>
{/snippet}

<!-- upload notice -->
{#if uploads.notice}
	<p class="text-sm px-3 py-2 border border-current/40 rounded-md mb-2 bg-blue-300/5">
		{uploads.notice}
	</p>
{/if}

{#if uploads.jobs.length > 0}
	<ul class="divide-y divide-white/10" aria-live="polite" aria-label="Uploading">
		{#each uploads.jobs as job (job.file.name)}
			{@render row(job)}
		{/each}
	</ul>
	{#if uploads.canRetry}
		<div class="px-4 py-2">
			<button
				class="button button-xs"
				type="button"
				title="Upload the files that failed again, to the same stems"
				onclick={() => uploads.retryFailed()}
			>
				<span class="i-ph-arrow-clockwise" aria-hidden="true"></span>
				Retry failed
			</button>
		</div>
	{/if}
{/if}
