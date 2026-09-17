<script lang="ts">
	import { authClient } from "$lib/auth-client";

	let { data } = $props();

	let name = $state("");
	// The page reloads with new query params, so the initial value is the value.
	// svelte-ignore state_referenced_locally
	let email = $state(data.invitation?.email ?? "");
	let password = $state("");
	// svelte-ignore state_referenced_locally
	let inviteCode = $state(data.code);
	let error = $state("");
	let busy = $state(false);
	let sent = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = "";
		busy = true;
		// inviteToken / inviteCode ride along in the body; the user-create hook
		// reads them (src/lib/auth.ts) and refuses the sign-up without one.
		const result = await authClient.signUp.email({
			name,
			email,
			password,
			callbackURL: "/verify-email?verified=1",
			inviteToken: data.invitation?.token ?? "",
			inviteCode,
		} as Parameters<typeof authClient.signUp.email>[0]);
		busy = false;
		if (result.error) {
			error = result.error.message ?? "Sign-up failed";
			return;
		}
		// A new user gets their own account (see src/lib/auth.ts) and joins the
		// inviting one; signing in waits for the verification link just sent.
		sent = true;
	}
</script>

<svelte:head>
	<title>Create an account — Stem Shovel</title>
</svelte:head>

<main class="page-x-padding pt-8 min-h-screen">
	<header class="max-w-article">
		<h1 class="heading-2">Create an account</h1>
		{#if data.invitation}
			<p class="opacity-90">
				You were invited to <strong>{data.invitation.account}</strong> as {data.invitation.role}.
			</p>
		{:else}
			<p class="opacity-90 text-balance mb-5">
				Stem Shovel is invitation-only. You need an invitation link or an invite code from an
				account admin. Need an invite? <a
					class="underline underline-offset-4 hover-text-accent"
					href="/waitlist">Join the waitlist</a
				>.
			</p>
		{/if}
	</header>
	{#if sent}
		<section class="max-w-sm surface px-5 py-4">
			<h2 class="heading-2">Check your email</h2>
			<p class="text-15px">
				We sent a link to <strong>{email}</strong>. Open it to verify the address and you will be
				signed in.
			</p>
		</section>
	{:else}
		{#if data.invitationStatus}
			<p class="mb-5 max-w-sm text-sm text-red-400" role="alert">
				{#if data.invitationStatus === "expired"}
					That invitation link has expired. Ask for a new one, or use an invite code.
				{:else if data.invitationStatus === "accepted"}
					That invitation has already been used. Sign in instead, or use an invite code.
				{:else}
					That invitation link is not valid. Use an invite code instead.
				{/if}
			</p>
		{/if}
		<form class="grid max-w-sm gap-5" onsubmit={submit}>
			{#if !data.invitation}
				<label class="block">
					<span class="text-15px text-dim">Invite code</span>
					<input
						class="mt-1 field font-mono uppercase"
						type="text"
						autocomplete="off"
						autocapitalize="characters"
						spellcheck="false"
						placeholder="ABCD-EFGH-JKLM"
						bind:value={inviteCode}
						required
					/>
				</label>
			{/if}
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
				<input
					class="mt-1 field"
					type="email"
					autocomplete="email"
					bind:value={email}
					readonly={!!data.invitation}
					required
				/>
				{#if data.invitation}
					<span class="mt-1 block text-13px text-dim">The address the invitation was sent to.</span>
				{/if}
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
			{#if error}<p class="text-sm text-red-400" role="alert">{error}</p>{/if}
			<p class="text-13px text-dim">
				By creating an account you agree to the
				<a class="link-dim" href="/docs/copyright-policy">copyright and acceptable-use policy</a>
				and the <a class="link-dim" href="/docs/privacy-policy">privacy policy</a>: upload and share
				only material you own or have permission to use.
			</p>
			<div class="flex flex-wrap items-center gap-x-4 gap-y-3">
				<button class="button-accent whitespace-nowrap" disabled={busy}
					>{busy ? "Creating…" : "Create account"}</button
				>
				<a class="text-sm link-dim whitespace-nowrap" href="/sign-in">I have an account</a>
			</div>
		</form>
	{/if}
</main>
