<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";
	import { page } from "$app/state";

	let status = $derived(page.status);
	let message = $derived(page.error?.message ?? "Something went wrong.");
	let next = $derived(page.url.pathname + page.url.search);
</script>

<svelte:head>
	<title>{pageTitle(String(status))}</title>
</svelte:head>

<main class="page min-h-[60vh]">
	<header class="max-w-article">
		<h1 class="display">
			{status === 404 ? "Not found" : status === 403 ? "Private" : `Error ${status}`}
		</h1>
		<p class="opacity-90">{message}</p>
	</header>
	{#if status === 403 && !page.data.user}
		<div class="flex flex-wrap gap-3">
			<a class="button-accent" href="/sign-in?next={encodeURIComponent(next)}">Sign in</a>
		</div>
	{:else if status === 404}
		<a class="link-dim" href="/">Home</a>
	{/if}
</main>
