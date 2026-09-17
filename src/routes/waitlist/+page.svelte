<script lang="ts">
	import WaitlistForm from "$lib/components/WaitlistForm.svelte";
</script>

<svelte:head>
	<title>Join the waitlist — Stem Shovel</title>
</svelte:head>

<main class="page min-h-screen">
	<header class="max-w-article">
		<h1 class="display">Join the waitlist</h1>
		<p class="opacity-90 max-w-prose">
			Stem Shovel is in early beta and sign-up needs an invite code. Leave your address, confirm it
			from the email we send, and we will send you a code as seats open.
		</p>
	</header>
	<section class="max-w-article">
		<WaitlistForm />
	</section>
</main>
