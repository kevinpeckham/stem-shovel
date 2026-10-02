<script lang="ts">
	/**
	 * The words under a device (docs/page-copy.md): the copy doc's body as
	 * rendered markdown in the drum machine page's tips box, with a button to
	 * the user docs after it. Nothing without a body.
	 */
	interface Props {
		html: string;
		docsHref: string;
		/** The button's text ("Looper docs"). */
		docsLabel: string;
		/** The line before the button. */
		docsLead?: string;
	}
	let { html, docsHref, docsLabel, docsLead = "Learn more in the user docs." }: Props = $props();
</script>

{#if html}
	<section
		class="mt-8 rounded-md border px-5 pt-6 pb-7 [&_h2]-(font-600) [&_h3]-(font-600 mb-3 mt-5) [&_p]-(max-w-article mt-4 text-16px opacity-90) [&_ul]-(list-disc pl-4 opacity-90 grid grid-cols-1 gap-y-2 mt-3) [&_a]-(link)"
	>
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- markdown rendered server-side from the copy doc (never user text) -->
		{@html html}
		<div class="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
			<span class="text-15px opacity-90">{docsLead}</span>
			<a class="button button-sm" href={docsHref}>
				<span class="i-ph-book-open" aria-hidden="true"></span>
				{docsLabel}
				<span class="i-ph-arrow-right" aria-hidden="true"></span>
			</a>
		</div>
	</section>
{/if}
