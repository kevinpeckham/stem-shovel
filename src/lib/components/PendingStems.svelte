<script lang="ts">
	import { STEM_ACCEPT } from "#lib/constants/stemFormats.js";
	import { deleteStem } from "#lib/remote/songs.remote.js";
	import type { StemActions } from "#lib/state/stemActions.svelte.js";

	/** A stem that is not ready. */
	interface Pending {
		id: string;
		label: string;
		filename: string;
	}
	interface Props {
		/** The song's stems that are not ready (an upload interrupted, or one on its way again). */
		pending: Pending[];
		actions: StemActions;
		canEdit: boolean;
	}
	let { pending, actions, canEdit }: Props = $props();
</script>

{#snippet row(stem: Pending)}
	{@const job = actions.replacing[stem.id]}
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
			{#if canEdit}
				<label class="cursor-pointer link">
					Upload file
					<input
						class="sr-only"
						type="file"
						accept={STEM_ACCEPT}
						disabled={!!job}
						onchange={(e) => actions.replace(stem.id, e.currentTarget)}
					/>
				</label>
				<form {...remove}>
					<input {...remove.fields.id.as("hidden", stem.id)} />
					<button class="link" disabled={!!remove.pending}>Remove</button>
				</form>
			{/if}
		</span>
		{#if job?.error}<p class="w-full text-xs text-red-400">{job.error}</p>{/if}
	</li>
{/snippet}

{#if pending.length > 0}
	<ul class="mt-4 surface divide-y divide-white/10 text-sm" aria-label="Stems not ready">
		{#each pending as stem (stem.id)}
			{@render row(stem)}
		{/each}
	</ul>
{/if}
