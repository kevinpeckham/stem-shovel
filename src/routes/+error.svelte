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

<main class="page-x-padding main-y-padding min-h-screen">
	<header class="max-w-article mb-8">
		<h1 class="app-page-heading mb-5">
			{status === 404
				? "404 Error: Not found"
				: status === 403
					? "403 Error: Private"
					: `Error ${status}`}
		</h1>
		<p class="app-page-subheading">
			No one feels worse about this than we do. We hope you find what you're looking for.
		</p>
	</header>
	{#if status === 403 && !page.data.user}
		<div class="flex flex-wrap gap-3">
			<a class="button-accent" href="/sign-in?next={encodeURIComponent(next)}">Sign in</a>
		</div>
	{:else if status === 404}
		<a class="button button-accent" href="/">Back to Home</a>
	{/if}
</main>
