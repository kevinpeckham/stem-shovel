<script lang="ts">
	import type { ComponentProps } from "svelte";
	import SongDraftCard from "#lib/components/SongDraftCard.svelte";
	import type { SongChordDraft } from "#lib/state/songChordDraft.svelte.js";

	type CardProps = ComponentProps<typeof SongDraftCard>;
	interface Props extends Omit<CardProps, "chordDraft"> {
		/** The draft and the detection's error. */
		chordDraft: Pick<SongChordDraft, "draft" | "chordError" | "chartPart" | "partBusy">;
	}
	let { chordDraft, ...card }: Props = $props();
</script>

<!-- Above the chart in the Docs panel: the detection's error, and the AI's draft card. -->
{#if chordDraft.chordError}<p class="mb-4 text-sm text-red-400" role="alert">
		{chordDraft.chordError}
	</p>{/if}
{#if chordDraft.draft}
	<div class="mb-6"><SongDraftCard {chordDraft} {...card} /></div>
{/if}
