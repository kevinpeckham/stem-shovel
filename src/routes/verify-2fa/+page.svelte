<script lang="ts">
	import { errorMessage } from "$lib/utils/errorMessage";
	import { goto, invalidateAll } from "$app/navigation";
	import { authClient } from "$lib/auth-client";

	let { data } = $props();
	let code = $state("");
	let backupCode = $state("");
	let useBackup = $state(false);
	let trustDevice = $state(false);
	let busy = $state(false);
	let error = $state("");
	let codeValid = $derived(/^\d{6}$/.test(code));

	async function verify() {
		if (busy) return;
		error = "";
		busy = true;
		try {
			const result = useBackup
				? await authClient.twoFactor.verifyBackupCode({ code: backupCode.trim(), trustDevice })
				: await authClient.twoFactor.verifyTotp({ code, trustDevice });
			if (result.error) {
				error = result.error.message ?? "That code did not work";
				return;
			}
			await invalidateAll();
			await goto(data.next);
		} catch (e) {
			error = errorMessage(e);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Two-factor code — Stem Shovel</title>
</svelte:head>

<main class="page min-h-screen">
	<header class="max-w-article">
		<h1 class="display">One more step</h1>
		<p class="opacity-90">
			{useBackup
				? "Enter one of your backup codes. Each works once."
				: "Enter the six-digit code from your authenticator app."}
		</p>
	</header>
	<form
		class="grid max-w-sm gap-5"
		onsubmit={(e) => {
			e.preventDefault();
			void verify();
		}}
	>
		{#if useBackup}
			<label class="block">
				<span class="text-15px text-dim">Backup code</span>
				<input
					class="mt-1 field font-mono tracking-widest"
					type="text"
					autocomplete="off"
					spellcheck="false"
					bind:value={backupCode}
					required
					disabled={busy}
				/>
			</label>
		{:else}
			<label class="block">
				<span class="text-15px text-dim">Code</span>
				<input
					class="mt-1 field text-center font-mono text-24px tracking-[0.4em]"
					type="text"
					inputmode="numeric"
					autocomplete="one-time-code"
					pattern="[0-9]*"
					maxlength="6"
					placeholder="000000"
					bind:value={code}
					oninput={() => {
						code = code.replace(/\D/g, "").slice(0, 6);
						if (codeValid) void verify();
					}}
					required
					disabled={busy}
				/>
			</label>
		{/if}
		<label class="flex items-center gap-2 text-sm">
			<input type="checkbox" bind:checked={trustDevice} />
			Trust this device for 30 days
		</label>
		{#if error}<p class="text-sm text-red-400" role="alert">{error}</p>{/if}
		<div class="flex flex-wrap items-center gap-4">
			<button
				class="button-accent"
				disabled={busy || (useBackup ? !backupCode.trim() : !codeValid)}
			>
				{busy ? "Checking…" : "Continue"}
			</button>
			<button
				class="text-sm link-dim"
				type="button"
				onclick={() => {
					useBackup = !useBackup;
					error = "";
				}}
			>
				{useBackup ? "Use the authenticator app instead" : "Use a backup code instead"}
			</button>
			<a class="text-sm link-dim" href="/sign-in">Back to sign in</a>
		</div>
	</form>
</main>
