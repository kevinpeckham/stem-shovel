<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { authClient } from "$lib/auth-client";

	let token = $derived(page.url.searchParams.get("token") ?? "");
	let expired = $derived(page.url.searchParams.get("error") === "INVALID_TOKEN");
	let password = $state("");
	let confirm = $state("");
	let error = $state("");
	let busy = $state(false);
	let done = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = "";
		if (password !== confirm) {
			error = "The two passwords differ.";
			return;
		}
		busy = true;
		const result = await authClient.resetPassword({ newPassword: password, token });
		busy = false;
		if (result.error) {
			error = result.error.message ?? "Could not reset the password";
			return;
		}
		done = true;
		setTimeout(() => goto("/sign-in"), 1500);
	}
</script>

<svelte:head>
	<title>Reset password — Stem Shovel</title>
</svelte:head>

<main class="page min-h-screen">
	<header class="max-w-article">
		<h1 class="display">Choose a new password</h1>
	</header>
	{#if expired || !token}
		<section class="max-w-sm surface px-5 py-4">
			<p class="text-15px">This reset link is invalid or has expired.</p>
			<a class="mt-2 block text-sm link-dim" href="/forgot-password">Request a new one</a>
		</section>
	{:else if done}
		<section class="max-w-sm surface px-5 py-4">
			<p class="text-15px">Password changed. Taking you to sign in…</p>
		</section>
	{:else}
		<form class="grid max-w-sm gap-5" onsubmit={submit}>
			<label class="block">
				<span class="text-15px text-dim">New password</span>
				<input
					class="mt-1 field"
					type="password"
					autocomplete="new-password"
					bind:value={password}
					required
					minlength="8"
				/>
			</label>
			<label class="block">
				<span class="text-15px text-dim">Repeat it</span>
				<input
					class="mt-1 field"
					type="password"
					autocomplete="new-password"
					bind:value={confirm}
					required
					minlength="8"
				/>
			</label>
			{#if error}<p class="text-sm text-red-400">{error}</p>{/if}
			<button class="button-accent justify-self-start" disabled={busy}>
				{busy ? "Saving…" : "Set password"}
			</button>
		</form>
	{/if}
</main>
