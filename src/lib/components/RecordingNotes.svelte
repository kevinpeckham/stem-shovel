<script lang="ts">
	/**
	 * A recording's notes as its uploader typed them (a demo's, given at
	 * upload): plain text with its line breaks, under a "Notes" heading;
	 * nothing at all when there are none.
	 */
	interface Props {
		notes: string;
		/** Where the block sits on its page (margins, width). */
		class?: string;
	}
	let { notes, class: classes = "" }: Props = $props();
</script>

{#if notes.trim()}
	<section class="grid gap-1 {classes}" aria-label="Notes" data-recording-notes>
		<h3 class="text-12px uppercase tracking-wider text-blue-300 opacity-90">Notes</h3>
		<p class="whitespace-pre-wrap break-words text-sm">{notes}</p>
	</section>
{/if}
