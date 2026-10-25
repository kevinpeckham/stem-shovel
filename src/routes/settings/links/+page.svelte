<script lang="ts">
	import ShortLinkRow from "#lib/components/ShortLinkRow.svelte";
	import { pageTitle } from "#lib/utils/pageTitle.js";
	import { shortLinkUrl } from "#lib/utils/shortLinkUrl.js";

	/**
	 * The signed-in user's short links (docs/security.md "Short links"):
	 * each one's address, where it goes, how often it was followed, and
	 * Copy, Revoke and a custom address in place of the random code.
	 */
	let { data } = $props();
	const address = (code: string) => shortLinkUrl(code, data.shortOrigin ?? undefined, data.origin);
</script>

<svelte:head>
	<title>{pageTitle("Links")}</title>
</svelte:head>

<main class="page">
	<header class="max-w-article">
		<h1 class="display">Links</h1>
		<p class="opacity-90 text-balance">
			A short link is a brief address that stands for a long one, so a share link with all its
			settings fits in a message. Each one you make while signed in is kept here and never expires;
			revoke one and it stops working for everyone.
		</p>
	</header>

	<section class="max-w-article">
		<h2 class="heading-2">Your short links</h2>
		{#if data.links.length === 0}
			<p class="mt-1 text-sm opacity-90">
				None yet. Links appear here when you copy a share link on an instrument, a song or a
				project.
			</p>
		{:else}
			<p class="mt-1 text-sm opacity-90">
				Give a link a custom address to make it easy to say or type. The old address stops working
				when you do.
			</p>
			<ul class="mt-4 grid gap-2" aria-label="Your short links">
				{#each data.links as link (link.id)}
					<ShortLinkRow {link} {address} />
				{/each}
			</ul>
		{/if}
	</section>
</main>
