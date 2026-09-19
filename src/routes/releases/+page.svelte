<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";
	import { formatDate } from "$lib/utils/formatDate";

	let { data } = $props();

	/** "2026-09-19" as the site writes dates; the string is a date only, so noon avoids a timezone slip. */
	const when = (iso: string) => formatDate(new Date(`${iso}T12:00:00`));
</script>

<svelte:head>
	<title>{pageTitle("Releases")}</title>
</svelte:head>

<main class="page">
	<header class="max-w-article mb-6">
		<h1 class="heading-2">Releases</h1>
		<p class="opacity-90 text-balance">
			What changed in each version of Stem Shovel, newest first. The build you are looking at is
			named in the footer.
		</p>
	</header>

	<div class="grid gap-8 max-w-article">
		{#each data.releases as r (r.version)}
			<section id="v{r.version}" class="scroll-mt-20">
				<h2 class="heading-3 flex flex-wrap items-baseline gap-x-3">
					<a class="hover:text-maximumYellow" href="#v{r.version}"
						>{r.version === "Unreleased" ? "Coming next" : `v${r.version}`}</a
					>
					{#if r.date}
						<span class="text-13px font-400 opacity-70">{when(r.date)}</span>
					{/if}
				</h2>
				<div class="chart-body surface px-6 pt-5 pb-6">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized server-side in renderMarkdown -->
					{@html r.html}
				</div>
			</section>
		{/each}
	</div>
</main>
