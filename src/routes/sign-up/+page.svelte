<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";
	import { authClient } from "$lib/auth-client";
	import { PLAN_LIMITS } from "$lib/constants/plans";
	import { formatBytes } from "$lib/utils/formatBytes";

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

	/**
	 * Step 1, choosing a plan and accepting its terms, applies to a newcomer
	 * who will get an account of their own; an invitee joins an account that
	 * already has a plan, so they only accept the terms, in the form.
	 */
	// svelte-ignore state_referenced_locally
	let step = $state<"plan" | "details">(data.invitation ? "details" : "plan");
	let plan = $state<"free">("free");
	let acceptTerms = $state(false);
	const free = PLAN_LIMITS.free;

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = "";
		busy = true;
		// inviteToken / inviteCode / acceptPlanTerms ride along in the body; the
		// user-create hook reads them (src/lib/auth.ts).
		const result = await authClient.signUp.email({
			name,
			email,
			password,
			callbackURL: "/verify-email?verified=1",
			inviteToken: data.invitation?.token ?? "",
			inviteCode,
			plan,
			acceptPlanTerms: acceptTerms ? "yes" : "no",
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
	<title>{pageTitle(data.open ? "Create a free account" : "Create an account")}</title>
</svelte:head>

<main class="page-x-padding main-y-padding min-h-screen">
	<header class="max-w-article">
		<h1 class="app-page-heading mb-5">
			{data.open ? "Create a free account" : "Create an account"}
		</h1>
		{#if data.invitation}
			<p class="app-page-subheading text-balance">
				You were invited to <strong>{data.invitation.account}</strong> as {data.invitation.role}.
			</p>
		{:else if data.open}
			<p class="app-page-subheading text-balance">Free forever. No credit card required.</p>
		{:else}
			<p class="app-page-subheading text-balance">
				Stem Shovel is invitation-only. You need an invitation link or an invite code from an
				account admin. Need an invite? <a
					class="inline-block ml-2 underline underline-offset-4 text-accent opacity-90 hover-opacity-100"
					href="/waitlist">Join the waitlist</a
				>.
			</p>
		{/if}
	</header>

	<section class="mt-8">
		{#if sent}
			<div class="max-w-sm surface px-5 py-4">
				<h2 class="app-section-heading">Check your email</h2>
				<p class="opacity-90">
					We sent a link to <strong>{email}</strong>. Open it to verify the address and you will be
					signed in.
				</p>
			</div>
		{:else if step === "plan"}
			<!-- Step 1: the plan. Only Free exists today; the card states what it holds. -->
			<form
				class="grid max-w-md gap-5"
				onsubmit={(e) => {
					e.preventDefault();
					if (acceptTerms) step = "details";
				}}
			>
				<p class="text-13px uppercase tracking-wider text-dim">Step 1 of 2 · Choose a plan</p>
				<label
					class="marketing-box flex cursor-pointer items-start gap-3 pb-4 {plan === 'free'
						? 'border-accent/60'
						: ''}"
				>
					<input class="mt-1.5" type="radio" name="plan" value="free" bind:group={plan} required />
					<span class="grow">
						<span class="flex flex-wrap items-baseline justify-between gap-2">
							<span class="text-18px font-700 text-white">Free</span>
							<span class="font-mono tabular-nums"
								><span class="text-20px text-white">$0</span><span class="text-dim">
									/ month</span
								></span
							>
						</span>
						<span class="mt-1 block text-sm opacity-80">
							Free forever. No credit card required to get started.
						</span>
						<span class="mt-2 grid gap-1 text-sm">
							<span>Unlimited projects, songs and ideas</span>
							<span>{formatBytes(free.storageBytes)} of storage</span>
							<span>Up to {free.members} members · unlimited viewers</span>
						</span>
					</span>
				</label>
				<div class="infobox-sm">
					<span class="block mb-2 font-700">Note</span>
					<span class="opacity-90"
						>A Professional plan with more storage and more members is launching soon.</span
					>
					<a class="block my-3 link" href="/pricing">See pricing</a>
				</div>
				<label class="flex items-start gap-4 text-sm my-5 text-balance">
					<input class="mt-0.5" type="checkbox" bind:checked={acceptTerms} required />
					<div class="opacity-90">
						I accept the <a class="link opacity-100" href="/docs/plan-terms" target="_blank"
							>Free plan terms</a
						>, the
						<a class="link opacity-100" href="/docs/copyright-policy" target="_blank">copyright</a>
						and
						<a class="link opacity-100" href="/docs/copyright-policy" target="_blank"
							>acceptable use</a
						>
						policies and the
						<a class="link opacity-100" href="/docs/privacy-policy" target="_blank"
							>privacy policy</a
						>.
					</div>
				</label>
				<div class="flex flex-wrap items-center gap-x-4 gap-y-3">
					<button class="button-accent whitespace-nowrap" disabled={!acceptTerms}>Continue</button>
					<a class="text-0.9em link" href="/sign-in">I already have an account</a>
				</div>
			</form>
		{:else}
			{#if data.invitationStatus}
				<p class="mb-5 max-w-sm text-sm text-red-400" role="alert">
					{#if data.invitationStatus === "expired"}
						That invitation link has expired. Ask for a new one{data.open
							? ""
							: ", or use an invite code"}.
					{:else if data.invitationStatus === "accepted"}
						That invitation has already been used. Sign in instead{data.open
							? ""
							: ", or use an invite code"}.
					{:else}
						That invitation link is not valid.{data.open ? "" : " Use an invite code instead."}
					{/if}
				</p>
			{/if}
			<form class="grid max-w-sm gap-5" onsubmit={submit}>
				{#if !data.invitation}
					<p class="text-13px uppercase tracking-wider text-dim">
						Step 2 of 2 · Your details
						<button
							class="ml-2 normal-case tracking-normal link"
							type="button"
							onclick={() => (step = "plan")}>Change plan</button
						>
					</p>
				{/if}
				{#if !data.invitation && !data.open}
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
						<span class="mt-1 block text-13px text-dim"
							>The address the invitation was sent to.</span
						>
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
				{#if !data.invitation && data.open}
					<div class="infobox-sm mb-5">
						<div class="text-sm">
							<div class="text-dim">Invite Code (optional)</div>
							<label class="mt-2 block">
								<!-- <span class="text-13px text-dim">It joins you to that account as well.</span> -->
								<input
									class="mt-1 field font-mono uppercase"
									type="text"
									autocomplete="off"
									autocapitalize="characters"
									spellcheck="false"
									placeholder="ABCD-EFGH-JKLM"
									bind:value={inviteCode}
								/>
							</label>
						</div>
					</div>
				{/if}
				{#if data.invitation}
					<label class="flex items-start gap-2 text-sm">
						<input class="mt-0.5" type="checkbox" bind:checked={acceptTerms} required />
						<span class="text-balance opacity-90">
							I accept the <a class="link opacity-100" href="/docs/plan-terms" target="_blank"
								>plan terms</a
							>, the
							<a class="link opacity-100" href="/docs/copyright-policy" target="_blank">copyright</a
							>
							and
							<a class="link opacity-100" href="/docs/copyright-policy" target="_blank"
								>acceptable use</a
							>
							policies and the
							<a class="link opacity-100" href="/docs/privacy-policy" target="_blank"
								>privacy policy</a
							>.
						</span>
					</label>
				{/if}
				{#if error}<p class="text-sm text-red-400" role="alert">{error}</p>{/if}
				<div class="flex flex-wrap items-center gap-x-4 gap-y-3">
					<button class="button-accent whitespace-nowrap" disabled={busy || !acceptTerms}
						>{busy ? "Creating…" : "Create account"}</button
					>
					<a class="text-sm link whitespace-nowrap" href="/sign-in">I already have an account</a>
				</div>
			</form>
		{/if}
	</section>
</main>
