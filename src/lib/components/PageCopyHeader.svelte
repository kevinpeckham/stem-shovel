<script lang="ts">
	import InfoTip from "$lib/components/InfoTip.svelte";
	import type { PageCopy } from "$lib/server/pageCopy";
	import type { Snippet } from "svelte";

	/**
	 * A tool or instrument page's header from its copy doc (docs/page-copy.md):
	 * the title, an InfoTip on phones and the intro from sm, laid out as the
	 * drum machine's and the piano's; a system admin gets an Edit button to the
	 * doc, as on the releases page. `controls` sit at the right (the recorder
	 * page's panel buttons, say).
	 */
	interface Props {
		copy: Pick<PageCopy, "title" | "intro" | "canEdit" | "editHref">;
		controls?: Snippet;
		/** A line under the intro that is the page's own (the recorder's "Opened from" link). */
		after?: Snippet;
		/** The header's outer classes; the recorder's phone layout wants a tighter margin than the default. */
		class?: string;
	}
	let { copy, controls, after, class: headerClass = "mb-8" }: Props = $props();
</script>

<header class="{headerClass} flex flex-wrap items-start justify-between gap-4">
	<div class="max-w-prose">
		<div class="flex items-baseline gap-2 sm-mb-5">
			<h1 class="app-page-heading">{copy.title}</h1>
			{#if copy.intro}
				<InfoTip class="sm-hidden" text={copy.intro} />
			{/if}
			{#if copy.canEdit}
				<a class="button button-xs ml-2" href={copy.editHref} title="Edit this page's words">
					<span class="i-ph-pencil-simple" aria-hidden="true"></span>
					Edit
				</a>
			{/if}
		</div>
		{#if copy.intro}
			<p class="app-page-subheading hidden sm-block text-balance">{copy.intro}</p>
		{/if}
		{@render after?.()}
	</div>
	{#if controls}
		<div class="flex gap-2">{@render controls()}</div>
	{/if}
</header>
