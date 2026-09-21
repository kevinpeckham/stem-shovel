<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";
	import { safeNext } from "$lib/utils/safeNext";
	import { goto } from "$app/navigation";
	import { authClient } from "$lib/auth-client";
	import { errorMessage } from "$lib/utils/errorMessage";
	import { onMount } from "svelte";

	let { data } = $props();
	let email = $state("");
	let password = $state("");
	let error = $state("");
	let busy = $state(false);
	let passkeyBusy = $state(false);

	/**
	 * A passkey signs in on its own: no password, and no two-factor step
	 * (the device already verified the person). `autoFill` lets the browser
	 * offer saved passkeys in the email field's suggestions.
	 */
	async function signInWithPasskey(autoFill = false) {
		if (typeof window === "undefined" || !("PublicKeyCredential" in window)) return;
		if (!autoFill) {
			error = "";
			passkeyBusy = true;
		}
		const next = safeNext(data.next);
		try {
			const result = await authClient.signIn.passkey({ autoFill });
			if (result?.error) {
				if (!autoFill) error = result.error.message ?? "Passkey sign-in failed";
				return;
			}
			if (result?.data) await goto(next, { invalidateAll: true });
		} catch (e) {
			// The browser's own cancel (NotAllowedError) is not an error worth showing.
			if (!autoFill && (e as { name?: string }).name !== "NotAllowedError") error = errorMessage(e);
		} finally {
			if (!autoFill) passkeyBusy = false;
		}
	}

	onMount(() => {
		// Conditional mediation: the browser shows saved passkeys as the email field's suggestions.
		void signInWithPasskey(true);
	});

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = "";
		busy = true;
		const next = safeNext(data.next); // before any reload swaps `data` (see verify-2fa)
		const result = await authClient.signIn.email({
			email,
			password,
			callbackURL: "/verify-email?verified=1",
		});
		busy = false;
		// Password accepted, code still needed: the session is not signed in yet.
		if ((result.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) {
			await goto(`/verify-2fa?next=${encodeURIComponent(next)}`);
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
		await goto(next, { invalidateAll: true });
	}
</script>

<svelte:head>
	<title>{pageTitle("Sign in")}</title>
</svelte:head>

<main class="page-x-padding main-y-padding min-h-screen">
	<header class="max-w-article">
		<h1 class="app-page-heading mb-5">Sign in</h1>
		<p class="app-page-subheading">Sign in to access your account.</p>
	</header>
	<form class="grid max-w-sm gap-5 mt-8" onsubmit={submit}>
		<label class="block">
			<span class="text-15px text-dim">Email</span>
			<input
				class="mt-1 field"
				type="email"
				autocomplete="username webauthn"
				bind:value={email}
				required
			/>
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
		<div class="flex flex-wrap items-center gap-x-4 gap-y-3">
			<button class="button-accent whitespace-nowrap" disabled={busy}
				>{busy ? "Signing in…" : "Sign in"}</button
			>
			<a
				class="opacity-85 underline underline-offset-4 text-0.9em hover-text-accent whitespace-nowrap"
				href="/sign-up">Create an account</a
			>
			<a
				class="opacity-85 underline underline-offset-4 text-0.9em hover-text-accent whitespace-nowrap"
				href="/forgot-password">Forgot password?</a
			>
		</div>
		<div class="flex items-center gap-3 text-13px text-dim" aria-hidden="true">
			<span class="h-px grow bg-white/15"></span>or<span class="h-px grow bg-white/15"></span>
		</div>
		<button
			class="button max-w-none justify-center"
			type="button"
			disabled={busy || passkeyBusy}
			onclick={() => signInWithPasskey()}
		>
			<span class="i-ph-fingerprint text-18px" aria-hidden="true"></span>
			{passkeyBusy ? "Waiting for your device…" : "Sign in with a passkey"}
		</button>
		<!-- <a
			class="mt-48"
			href="/support"><span class="text-14px opacity-70">Need help signing in?</span></a
		> -->
	</form>
</main>
