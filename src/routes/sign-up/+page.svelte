<script lang="ts">
	import { goto, invalidateAll } from "$app/navigation";
	import { authClient } from "$lib/auth-client";

	let name = $state("");
	let email = $state("");
	let password = $state("");
	let error = $state("");
	let busy = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = "";
		busy = true;
		const result = await authClient.signUp.email({ name, email, password });
		busy = false;
		if (result.error) {
			error = result.error.message ?? "Sign-up failed";
			return;
		}
		// A new user gets their own account (see src/lib/auth.ts).
		await invalidateAll();
		await goto("/");
	}
</script>

<svelte:head>
	<title>Create an account — Stem Shovel</title>
</svelte:head>

<main class="page min-h-screen">
	<header class="max-w-article">
		<h1 class="display">Create an account</h1>
		<p class="opacity-90">You get your own workspace for projects and songs.</p>
	</header>
	<form class="grid max-w-sm gap-5" onsubmit={submit}>
		<label class="block">
			<span class="text-15px text-dim">Name</span>
			<input
				class="mt-1 field"
				type="text"
				autocomplete="name"
				bind:value={name}
				required
				minlength="2"
			/>
		</label>
		<label class="block">
			<span class="text-15px text-dim">Email</span>
			<input class="mt-1 field" type="email" autocomplete="email" bind:value={email} required />
		</label>
		<label class="block">
			<span class="text-15px text-dim">Password</span>
			<input
				class="mt-1 field"
				type="password"
				autocomplete="new-password"
				bind:value={password}
				required
				minlength="8"
			/>
			<span class="mt-1 block text-13px text-dim">At least 8 characters.</span>
		</label>
		{#if error}<p class="text-sm text-solo">{error}</p>{/if}
		<div class="flex items-center gap-4">
			<button class="button-accent" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
			<a class="text-sm link-dim" href="/sign-in">I have an account</a>
		</div>
	</form>
</main>
