<script lang="ts">
	import { pageTitle } from "#lib/utils/pageTitle.js";
	import { formatDate } from "#lib/utils/formatDate.js";

	let { data } = $props();

	/** "2026-09-19" as the site writes dates; the string is a date only, so noon avoids a timezone slip. */
	const when = (iso: string) => formatDate(new Date(`${iso}T12:00:00`));

	/** `/releases` for page 1 (one address per page), `/releases?page=N` after it. */
	const pageHref = (page: number) => (page === 1 ? "/releases" : `/releases?page=${page}`);
	const label = (version: string) => (version === "Unreleased" ? "Coming next" : `v${version}`);

	let first = $derived(data.releases[0]?.version);
	let last = $derived(data.releases.at(-1)?.version);
</script>

<svelte:head>
	<title>{pageTitle(data.page > 1 ? `Releases, page ${data.page}` : "Releases")}</title>
	<meta
		name="description"
		content="What changed in Stem Shovel, release by release: new features, changes and fixes a user would notice."
	/>
	<link rel="canonical" href="https://www.stemshovel.com{pageHref(data.page)}" />
	{#if data.page > 1}
		<link rel="prev" href="https://www.stemshovel.com{pageHref(data.page - 1)}" />
	{/if}
	{#if data.page < data.pages}
		<link rel="next" href="https://www.stemshovel.com{pageHref(data.page + 1)}" />
	{/if}
</svelte:head>

<main class="page">
	<header class="max-w-article mb-6 flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="heading-2">Releases</h1>
			<p class="opacity-90 text-balance">
				What changed in each version of Stem Shovel, newest first. The build you are looking at is
				named in the footer.{#if data.page > 1 && first && last}
					{" "}Older releases, from {label(first)} back to {label(last)}.{/if}
			</p>
		</div>
	</header>

	<div class="grid gap-8 max-w-article">
		{#if data.releases.length === 0}
			<p class="opacity-80">No release notes yet.</p>
		{/if}
		{#each data.releases as r (r.version)}
			<section id="v{r.version}" class="scroll-mt-20">
				<h2 class="heading-3 flex flex-wrap items-baseline gap-x-3">
					<a class="hover:text-accent" href="#v{r.version}">{label(r.version)}</a>
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

	<nav
		aria-label="Pages"
		class="max-w-article mt-8 flex flex-wrap items-center justify-between gap-3 text-sm"
	>
		{#if data.page > 1}
			<a class="button button-sm" href={pageHref(data.page - 1)}
				><span class="i-ph-caret-left" aria-hidden="true"></span> Newer</a
			>
		{:else}
			<span class="button button-sm opacity-50" aria-disabled="true"
				><span class="i-ph-caret-left" aria-hidden="true"></span> Newer</span
			>
		{/if}
		<span class="opacity-70" title="{data.total} releases in all"
			>Page {data.page} of {data.pages}</span
		>
		{#if data.page < data.pages}
			<a class="button button-sm" href={pageHref(data.page + 1)}
				>Older <span class="i-ph-caret-right" aria-hidden="true"></span></a
			>
		{:else}
			<span class="button button-sm opacity-50" aria-disabled="true"
				>Older <span class="i-ph-caret-right" aria-hidden="true"></span></span
			>
		{/if}
	</nav>
</main>
