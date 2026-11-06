<script lang="ts">
	interface Props {
		/** The viewer may comment: the comment gesture's line shows. */
		canComment: boolean;
	}
	let { canComment }: Props = $props();
</script>

<!-- The player's tips under the rows, as the instruments wear them (Kevin: the comment gesture is not obvious). -->
<div
	aria-label="Player tips"
	class="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-12px text-light [&_kbd]-(inline-block rounded border border-current/40 px-1.5 py-px font-mono text-11px leading-tight)"
>
	<span><kbd>Space</kbd> play / pause</span>
	<span><kbd>Home</kbd> to the start</span>
	<span>click a waveform to jump there</span>
	{#if canComment}
		<span
			><kbd>⌘</kbd>-click, <kbd>Ctrl</kbd>-click or right-click a waveform to leave a comment there</span
		>
	{/if}
</div>
