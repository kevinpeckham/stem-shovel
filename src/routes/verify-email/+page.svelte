<script lang="ts">
	import { page } from "$app/state";

	let { data } = $props();
	let verified = $derived(page.url.searchParams.get("verified") === "1");
	let problem = $derived(page.url.searchParams.get("error"));
</script>

<svelte:head>
	<title>Verify email — Stem Shovel</title>
</svelte:head>

<main class="page min-h-screen">
	<header class="max-w-article">
		<h1 class="display">
			{problem ? "That link did not work" : verified ? "Email verified" : "Verify your email"}
		</h1>
	</header>
	<section class="max-w-sm surface px-5 py-4 text-15px">
		{#if problem}
			<p>
				{problem === "token_expired" || problem === "invalid_token"
					? "The verification link has expired or was already used."
					: "Something went wrong verifying the address."} Sign in to get a fresh link.
			</p>
			<a class="mt-3 inline-block button-accent" href="/sign-in">Sign in</a>
		{:else if verified}
			<p>
				Your address is confirmed{data.user ? ` and you are signed in as ${data.user.name}` : ""}.
			</p>
			<a class="mt-3 inline-block button-accent" href={data.home}>Continue</a>
		{:else}
			<p>
				Open the link we emailed you to confirm your address. Signing in sends a new one if it has
				expired.
			</p>
			<a class="mt-3 inline-block button-accent" href="/sign-in">Sign in</a>
		{/if}
	</section>
</main>
