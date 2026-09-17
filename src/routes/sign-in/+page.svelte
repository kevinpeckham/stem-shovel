<script lang="ts">
	import { safeNext } from "$lib/utils/safeNext";
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
		const result = await authClient.signIn.email({
			email,
			password,
			callbackURL: "/verify-email?verified=1",
		});
		busy = false;
		// Password accepted, code still needed: the session is not signed in yet.
		if ((result.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) {
			await goto(`/verify-2fa?next=${encodeURIComponent(safeNext(data.next))}`);
			return;
		}
		if (result.error) {
			// 403 = the address is not verified yet; Better Auth has just sent a new link.
			error =
				result.error.status === 403
					? "Verify your email address first — we have just sent you a new link."
					: (result.error.message ?? "Sign-in failed");
			return;
		}
		await invalidateAll();
		await goto(safeNext(data.next));
	}
</script>

<svelte:head>
	<title>Sign in — Stem Shovel</title>
</svelte:head>

<main class="page-x-padding pt-8 min-h-screen">
	<header class="max-w-article">
		<h1 class="heading-2">Sign in</h1>
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
		{#if error}<p class="text-sm text-red-400">{error}</p>{/if}
		<div class="flex items-center gap-4">
			<button class="button-accent" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
			<a class="opacity-85 link-dim underline underline-offset-4 text-0.9em hover-text-accent" href="/sign-up">Create an account</a>
			<a class="opacity-85 link-dim underline underline-offset-4 text-0.9em hover-text-accent" href="/forgot-password">Forgot password?</a>
		</div>
	</form>
</main>
