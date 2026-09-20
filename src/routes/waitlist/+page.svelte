<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";
	import WaitlistForm from "$lib/components/WaitlistForm.svelte";
</script>

<svelte:head>
	<title>{pageTitle("Join the waitlist")}</title>
</svelte:head>

<main class="page-x-padding main-y-padding min-h-screen">
	<header class="max-w-article">
		<h1 class="app-page-heading mb-5">Join the waitlist</h1>
		<p class="app-page-subheading">
			Stem Shovel is in early beta and sign-up needs an invite code. Leave your address, confirm it
			from the email we send, and we will send you a code as seats open.
		</p>
	</header>
	<section class="max-w-article mt-8">
		<WaitlistForm />
	</section>
</main>
