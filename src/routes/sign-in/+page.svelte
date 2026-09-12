<script lang="ts">
	import { goto, invalidateAll } from "$app/navigation";
	import { authClient } from "$lib/auth-client";

	let { data } = $props();
	let email = $state("");
	let password = $state("");
	let error = $state("");
	let busy = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = "";
		busy = true;
		const result = await authClient.signIn.email({ email, password });
		busy = false;
		if (result.error) {
			error = result.error.message ?? "Sign-in failed";
			return;
		}
		await invalidateAll();
		await goto(data.next.startsWith("/") ? data.next : "/");
	}
</script>

<svelte:head>
	<title>Sign in — Stem Shovel</title>
</svelte:head>

<main class="page min-h-screen">
	<header class="max-w-article">
		<h1 class="display">Sign in</h1>
	</header>
	<form class="grid max-w-sm gap-5" onsubmit={submit}>
		<label class="block">
			<span class="text-15px text-dim">Email</span>
			<input class="mt-1 field" type="email" autocomplete="email" bind:value={email} required />
		</label>
		<label class="block">
			<span class="text-15px text-dim">Password</span>
			<input
				class="mt-1 field"
				type="password"
				autocomplete="current-password"
				bind:value={password}
				required
			/>
		</label>
		{#if error}<p class="text-sm text-solo">{error}</p>{/if}
		<div class="flex items-center gap-4">
			<button class="button-accent" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
			<a class="text-sm link-dim" href="/sign-up">Create an account</a>
		</div>
	</form>
</main>
