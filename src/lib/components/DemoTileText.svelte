<script lang="ts">
	import { formatBytes } from "#lib/utils/formatBytes.js";

	/**
	 * A demo tile's text in the song page's Demos view (DemoPanel): its
	 * label with a bubble of the signed-in person's new comments, and its
	 * size with how many comments it has and a note icon when it carries
	 * notes. The open demo's tile passes no counts and no icon (its comments
	 * and notes are above the list). The whole text is a button that opens
	 * the demo.
	 */
	interface Props {
		id: string;
		label: string;
		sizeBytes: number;
		/** Comments on the demo. */
		count?: number;
		/** New comments for the signed-in person (their unread comment notifications). */
		fresh?: number;
		/** The demo carries notes from its upload (shown when it is open). */
		hasNotes?: boolean;
		/** The demo open above the list, if any. */
		current?: string | null;
		/** The tile's body was pressed: open this demo without playing it. */
		onopen?: (id: string) => void;
	}
	let {
		id,
		label,
		sizeBytes,
		count = 0,
		fresh = 0,
		hasNotes = false,
		current = null,
		onopen,
	}: Props = $props();
	let freshName = $derived(`${fresh} new ${fresh === 1 ? "comment" : "comments"}`);
	let countText = $derived(`${count} ${count === 1 ? "comment" : "comments"}`);
</script>

<!-- The tile's body opens the demo above the list (its notes and comments) without playing it; Play is the button beside it (Kevin). -->
<button
	type="button"
	class="block min-w-0 grow cursor-pointer bg-transparent text-left"
	title="Show this demo's notes and comments"
	aria-label="Open {label}"
	aria-current={current === id ? "true" : undefined}
	onclick={() => onopen?.(id)}
>
	<span class="flex min-w-0 items-center gap-2 font-500">
		<span class="min-w-0 truncate">{label}</span>
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
			>{/if}{#if hasNotes}{" · "}<span
				class="i-ph-note inline-block align-[-2px] text-dim"
				role="img"
				title="Has notes"
				aria-label="Has notes"
				data-demo-has-notes
			></span>{/if}</span
	>
</button>
