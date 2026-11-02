<script lang="ts">
	import IdeaChartPanel from "#lib/components/IdeaChartPanel.svelte";
	import IdeaNotesPanel from "#lib/components/IdeaNotesPanel.svelte";

	/** An idea's documents, one at a time as its tabs choose (IdeaDocTabs): the notes or the barmark chart. */
	interface Props {
		doc: "notes" | "chart";
		idea: { id: string | null; notes: string; chart: string; title?: string };
		/** The idea's id, creating the idea if there is none yet. */
		ensureIdea: () => Promise<string>;
		/** Receive the notes or the chart after every save. */
		onnotes: (markdown: string) => void;
		onchart: (markdown: string) => void;
		/** After either saved: whether emptying it removed the idea. */
		onsaved: (result: { markdown: string; ideaDeleted: boolean }) => void;
	}
	let { doc, idea, ensureIdea, onnotes, onchart, onsaved }: Props = $props();
</script>

{#if doc === "chart"}
	<IdeaChartPanel {idea} {ensureIdea} onchange={onchart} {onsaved} />
{:else}
	<IdeaNotesPanel {idea} {ensureIdea} onchange={onnotes} {onsaved} />
{/if}
