<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";
	let { data } = $props();
</script>

<svelte:head>
	<title>{pageTitle("Waitlist")}</title>
</svelte:head>

<main class="page-x-padding main-y-padding min-h-screen">
	<header class="max-w-article">
		{#if data.ok}
			<h1 class="app-page-heading mb-5">You are on the list</h1>
			<p class="app-page-subheading">
				<strong>{data.email}</strong> is confirmed. Invite codes go out to the waitlist as seats open;
				yours will arrive at this address.
			</p>
			<p class="mt-8 text-sm opacity-80">
				{data.updatesOk
					? "You also asked for project updates."
					: "You will only hear from us about the waitlist itself."}
				<a class="underline underline-offset-2" href="/waitlist/manage/{data.manageToken}"
					>Change that, or leave the list</a
				>.
			</p>
		{:else}
			<h1 class="app-page-heading mb-5">That link is not open</h1>
			<p class="app-page-subheading">
				It may have been used already, or the entry was removed. If your address is confirmed you
				need do nothing; otherwise <a class="underline underline-offset-2" href="/waitlist"
					>join again</a
				> for a fresh email.
			</p>
		{/if}
	</header>
</main>
