<script lang="ts">
	import { authClient } from "$lib/auth-client";

	let email = $state("");
	let error = $state("");
	let busy = $state(false);
	let sent = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = "";
		busy = true;
		const result = await authClient.requestPasswordReset({
			email: email.trim(),
			redirectTo: "/reset-password",
		});
		busy = false;
		if (result.error) {
			error = result.error.message ?? "Could not send the email";
			return;
		}
		sent = true; // said the same way whether or not the address exists
	}
</script>

<svelte:head>
	<title>Forgot password — Stem Shovel</title>
</svelte:head>

<main class="page min-h-screen">
	<header class="max-w-article">
		<h1 class="display">Forgot password</h1>
		<p class="opacity-90">We will email you a link to choose a new one.</p>
	</header>
	{#if sent}
		<section class="max-w-sm surface px-5 py-4">
			<p class="text-15px">
				If <strong>{email}</strong> has an account, a reset link is on its way. It works once and expires
				in an hour.
			</p>
		</section>
	{:else}
		<form class="grid max-w-sm gap-5" onsubmit={submit}>
			<label class="block">
				<span class="text-15px text-dim">Email</span>
				<input class="mt-1 field" type="email" autocomplete="email" bind:value={email} required />
			</label>
			{#if error}<p class="text-sm text-red-400">{error}</p>{/if}
			<div class="flex items-center gap-4">
				<button class="button-accent" disabled={busy}
					>{busy ? "Sending…" : "Send reset link"}</button
				>
				<a class="text-sm link-dim" href="/sign-in">Back to sign in</a>
			</div>
		</form>
	{/if}
</main>
