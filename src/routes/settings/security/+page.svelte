<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";
	import QrCode from "$lib/components/QrCode.svelte";
	import { notifyTwoFactorChanged } from "$lib/remote/security.remote";
	import { notify } from "$lib/state/notifications.svelte";
	import { errorMessage } from "$lib/utils/errorMessage";
	import { invalidateAll } from "$app/navigation";
	import { authClient } from "$lib/auth-client";

	/**
	 * Two-factor (TOTP) for the signed-in user, driven through Better Auth's
	 * client plugin: enable (password → QR + backup codes → first code), disable
	 * (password), new backup codes (password). The server hears through
	 * notifyTwoFactorChanged only to send the "it changed" email.
	 */
	let { data } = $props();
	type Step = "idle" | "enabling" | "verifying" | "codes" | "disabling" | "regenerating";
	let step = $state<Step>("idle");
	let enabled = $derived(data.twoFactorEnabled);
	let password = $state("");
	let code = $state("");
	let totpURI = $state("");
	let backupCodes = $state<string[]>([]);
	let busy = $state(false);
	let error = $state("");
	/** The secret as text, for authenticator apps that cannot scan. */
	let secret = $derived(new URL(totpURI || "otpauth://totp/x").searchParams.get("secret") ?? "");

	function reset(to: Step = "idle") {
		step = to;
		password = "";
		code = "";
		error = "";
	}
	async function run(work: () => Promise<{ error?: { message?: string } | null } | void>) {
		error = "";
		busy = true;
		try {
			const result = await work();
			if (result && result.error) error = result.error.message ?? "That did not work";
			return !error;
		} catch (e) {
			error = errorMessage(e);
			return false;
		} finally {
			busy = false;
		}
	}
	async function startEnable() {
		await run(async () => {
			const result = await authClient.twoFactor.enable({ password });
			if (result.error) return result;
			const d = result.data;
			if (!d || !("totpURI" in d)) {
				error = "The server did not return a setup key";
				return;
			}
			totpURI = d.totpURI;
			backupCodes = d.backupCodes;
			password = "";
			step = "verifying";
		});
	}
	async function verifySetup() {
		await run(async () => {
			const result = await authClient.twoFactor.verifyTotp({ code });
			if (result.error) return result;
			code = "";
			step = "codes";
			await invalidateAll();
			notify("Two-factor authentication is on");
			void notifyTwoFactorChanged({ enabled: true }).catch(() => {});
		});
	}
	async function disable() {
		await run(async () => {
			const result = await authClient.twoFactor.disable({ password });
			if (result.error) return result;
			reset();
			await invalidateAll();
			notify("Two-factor authentication is off");
			void notifyTwoFactorChanged({ enabled: false }).catch(() => {});
		});
	}
	async function regenerate() {
		await run(async () => {
			const result = await authClient.twoFactor.generateBackupCodes({ password });
			if (result.error) return result;
			backupCodes = result.data?.backupCodes ?? [];
			password = "";
			step = "codes";
			notify("New backup codes made; the old ones no longer work");
		});
	}
	async function copyCodes() {
		try {
			await navigator.clipboard.writeText(backupCodes.join("\n"));
			notify("Backup codes copied");
		} catch {
			notify("Could not copy the codes", { kind: "error" });
		}
	}
</script>

<svelte:head>
	<title>{pageTitle("Security")}</title>
</svelte:head>

<main class="page">
	<header class="max-w-article">
		<h1 class="display">Security</h1>
		<p class="opacity-90">Your own sign-in, across every account you belong to.</p>
	</header>

	<section class="max-w-article">
		<h2 class="heading-2">Two-factor authentication</h2>
		<p class="mt-1 text-sm opacity-90">
			{#if enabled}
				<span
					class="i-ph-shield-check mr-1 inline-block align-[-2px] text-accent"
					aria-hidden="true"
				></span>On. Signing in asks for a six-digit code from your authenticator app, or a backup
				code.
			{:else}
				Off. With it on, signing in needs your password and a six-digit code from an authenticator
				app (1Password, Google Authenticator, Authy and the like), so a stolen password alone is not
				enough.
			{/if}
		</p>

		{#if error}<p class="mt-3 text-sm text-red-400" role="alert">{error}</p>{/if}

		{#if step === "idle"}
			<div class="mt-4 flex flex-wrap gap-3">
				{#if enabled}
					<button class="button button-sm" type="button" onclick={() => reset("regenerating")}>
						New backup codes
					</button>
					<button class="button button-sm" type="button" onclick={() => reset("disabling")}>
						Turn off
					</button>
				{:else}
					<button class="button-accent" type="button" onclick={() => reset("enabling")}>
						Turn on
					</button>
				{/if}
			</div>
		{:else if step === "enabling" || step === "disabling" || step === "regenerating"}
			<form
				class="mt-4 grid max-w-sm gap-4"
				onsubmit={(e) => {
					e.preventDefault();
					void (step === "enabling"
						? startEnable()
						: step === "disabling"
							? disable()
							: regenerate());
				}}
			>
				<label class="block">
					<span class="text-15px text-dim">Your password, to confirm</span>
					<input
						class="mt-1 field"
						type="password"
						autocomplete="current-password"
						bind:value={password}
						required
						disabled={busy}
					/>
				</label>
				<div class="flex items-center gap-4">
					<button class="button-accent" disabled={busy || !password}>
						{busy
							? "Working…"
							: step === "enabling"
								? "Continue"
								: step === "disabling"
									? "Turn off two-factor"
									: "Make new codes"}
					</button>
					<button class="text-sm link-dim" type="button" onclick={() => reset()}>Cancel</button>
				</div>
			</form>
		{:else if step === "verifying"}
			<div class="mt-4 grid gap-4 md:grid-cols-[auto_1fr]">
				<QrCode data={totpURI} size={200} />
				<div class="grid content-start gap-3 text-sm">
					<p>
						Scan this with your authenticator app, or enter the key by hand:
						<code class="block mt-1 break-all font-mono tracking-wider select-all">{secret}</code>
					</p>
					<form
						class="grid max-w-xs gap-3"
						onsubmit={(e) => {
							e.preventDefault();
							void verifySetup();
						}}
					>
						<label class="block">
							<span class="text-15px text-dim">Then the code it shows</span>
							<input
								class="mt-1 field text-center font-mono text-20px tracking-[0.4em]"
								type="text"
								inputmode="numeric"
								autocomplete="one-time-code"
								maxlength="6"
								placeholder="000000"
								bind:value={code}
								oninput={() => (code = code.replace(/\D/g, "").slice(0, 6))}
								required
								disabled={busy}
							/>
						</label>
						<div class="flex items-center gap-4">
							<button class="button-accent" disabled={busy || code.length !== 6}>
								{busy ? "Checking…" : "Turn on two-factor"}
							</button>
							<button class="text-sm link-dim" type="button" onclick={() => reset()}>Cancel</button>
						</div>
					</form>
				</div>
			</div>
		{:else if step === "codes"}
			<div class="mt-4 max-w-md">
				<p class="text-sm opacity-90">
					Backup codes let you in when the app is out of reach. Each works once. Keep them somewhere
					safe; they are not shown again.
				</p>
				<ul
					class="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 rounded border border-white/15 bg-black/20 px-4 py-3 font-mono text-15px tracking-wider"
				>
					{#each backupCodes as c (c)}<li>{c}</li>{/each}
				</ul>
				<div class="mt-3 flex items-center gap-4">
					<button class="button button-sm" type="button" onclick={copyCodes}>Copy codes</button>
					<button class="text-sm link-dim" type="button" onclick={() => reset()}>Done</button>
				</div>
			</div>
		{/if}
	</section>
</main>
