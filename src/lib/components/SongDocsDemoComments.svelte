<script lang="ts">
	import type { DemoComment } from "#lib/constants/demoComments.js";
	import { formatDate } from "#lib/utils/formatDate.js";
	import { formatTime } from "#lib/utils/formatTime.js";

	/** The documents demo's Comments panel: the example comments plus the visitor's own. */
	interface Props {
		comments: DemoComment[];
		onremove?: (id: string) => void;
	}
	let { comments, onremove }: Props = $props();
</script>

<div
	class="h-full min-h-64 max-h-[70vh] overflow-y-auto bg-blue-300/5 border rounded-md border-current/40 px-6 pt-12 pb-8"
>
	<p class="mb-3 text-13px opacity-70">
		Example comments. Add your own from the player above (⌘-click or right-click a waveform); on the
		demo they live on this page only.
	</p>
	{#if comments.length === 0}
		<p class="opacity-80">No comments yet.</p>
	{:else}
		<ol class="grid gap-4">
			{#each comments as c (c.id)}
				<li class="rounded-md border border-white/10 bg-black/20 px-4 py-3">
					<div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
						<h3 class="font-600">{c.title}</h3>
						<span class="text-12px opacity-70">{c.authorName} · {formatDate(c.createdAt)}</span>
					</div>
					{#if c.at !== null}
						<p class="mt-1 text-12px opacity-70">
							<span class="i-ph-map-pin mr-1 inline-block align-[-2px]" aria-hidden="true"
							></span>{formatTime(c.at)}
						</p>
					{/if}
					<p class="mt-2 whitespace-pre-line text-15px">{c.body}</p>
					{#if c.mine && onremove}
						<button type="button" class="mt-2 text-12px link" onclick={() => onremove(c.id)}
							>Delete</button
						>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}
</div>
