<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";

	let { data } = $props();
</script>

<svelte:head>
	<title>{pageTitle(`Artists · ${data.account.name}`)}</title>
</svelte:head>

<main class="page">
	<header class="max-w-article mb-6">
		<h1 class="heading-2">Artists</h1>
		<p class="opacity-90 text-balance">
			Everyone credited on a song in {data.account.name}: bands, solo acts, writers, producers.
			Credit a name in a song's settings and it appears here; open one to add its website and
			people.
		</p>
	</header>
	{#if data.artists.length === 0}
		<p class="opacity-80">No artists yet.</p>
	{:else}
		<ul class="max-w-article surface divide-y divide-white/10 text-15px" aria-label="Artists">
			{#each data.artists as a (a.id)}
				<li class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3">
					<span class="font-600">
						<a
							class="hover-text-accent underline-offset-4 hover-underline"
							href="/{data.account.slug}/artists/{a.id}">{a.name}</a
						>
						{#if a.id === data.defaultArtistId}
							<span
								class="ml-2 rounded border border-white/20 px-1.5 py-0.5 text-10px uppercase tracking-wider opacity-70"
								title="New songs are credited to this artist">default</span
							>
						{/if}
					</span>
					<span class="text-13px text-dim">
						{a.songCount}
						{a.songCount === 1 ? "song" : "songs"} · {a.memberCount}
						{a.memberCount === 1 ? "person" : "people"}
						{#if a.website}
							· <a class="link-dim" href={a.website} rel="noopener">website</a>
						{/if}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</main>
