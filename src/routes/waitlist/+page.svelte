<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";
	import WaitlistForm from "$lib/components/WaitlistForm.svelte";

	let { data } = $props();
</script>

<svelte:head>
	<title>{pageTitle("Join the waitlist")}</title>
</svelte:head>

<main class="page-x-padding main-y-padding min-h-screen">
	{#if data.signUpOpen}
		<!-- Sign-up is open: an old link here goes straight on. -->
		<header class="max-w-article">
			<h1 class="app-page-heading mb-5">No waitlist needed</h1>
			<p class="app-page-subheading text-balance">
				Sign-up is open: create a free account now. No invitation and no credit card required.
			</p>
		</header>
		<div class="mt-8">
			<a class="button-accent-solid button-sm" href="/sign-up">Sign Up For Free</a>
		</div>
	{:else}
		<header class="max-w-article">
			<h1 class="app-page-heading mb-5">Join the waitlist</h1>
			<p class="app-page-subheading">
				Stem Shovel is in early beta and sign-up needs an invite code. Leave your address, confirm
				it from the email we send, and we will send you a code as seats open.
			</p>
		</header>
		<section class="max-w-article mt-8">
			<WaitlistForm />
		</section>
	{/if}
</main>
