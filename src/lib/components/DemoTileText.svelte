<script lang="ts">
	import { formatBytes } from "#lib/utils/formatBytes.js";

	/**
	 * A demo tile's text in the song page's Demos view (DemoPanel): its
	 * label with a bubble of the signed-in person's new comments, and its
	 * size with how many comments it has. The open demo's tile passes no
	 * counts (its comments are above the list).
	 */
	interface Props {
		label: string;
		sizeBytes: number;
		/** Comments on the demo. */
		count?: number;
		/** New comments for the signed-in person (their unread comment notifications). */
		fresh?: number;
	}
	let { label, sizeBytes, count = 0, fresh = 0 }: Props = $props();
	let freshName = $derived(`${fresh} new ${fresh === 1 ? "comment" : "comments"}`);
	let countText = $derived(`${count} ${count === 1 ? "comment" : "comments"}`);
</script>

<span class="min-w-0 grow">
	<span class="flex items-center gap-2 font-500">
		<span class="truncate">{label}</span>
		{#if fresh > 0}
			<span
				class="inline-flex shrink-0 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-11px font-700 leading-none text-oxford"
				title={freshName}
				aria-label={freshName}
				data-demo-new-comments>{fresh > 99 ? "99+" : fresh}</span
			>
		{/if}
	</span>
	<span class="block truncate text-xs opacity-85"
		>{formatBytes(sizeBytes)}{#if count > 0}{" · "}<span class="text-dim">{countText}</span
			>{/if}</span
	>
</span>
