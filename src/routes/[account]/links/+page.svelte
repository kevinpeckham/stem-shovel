<script lang="ts">
	import ShareLinkTable from "#lib/components/ShareLinkTable.svelte";
	import { pageTitle } from "#lib/utils/pageTitle.js";

	let { data } = $props();
</script>

<svelte:head>
	<title>{pageTitle(`Viewing links · ${data.account.name}`)}</title>
</svelte:head>

<main class="page">
	<header class="max-w-article">
		<h1 class="app-page-heading">Viewing links</h1>
		<p class="opacity-90 text-balance">
			Every link this account has handed out: what it opens, who made it and whether it still works.
			Revoke one and it stops working for everyone who has it; the page it opened stays as private
			as it was.
		</p>
	</header>
	<section class="max-w-article">
		<ShareLinkTable links={data.links} canEdit={data.canEdit} />
	</section>
</main>
