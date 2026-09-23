<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";
	import { setSignUpModeForm } from "$lib/remote/admin.remote";
	import { notify } from "$lib/state/notifications.svelte";
	import { invalidateAll } from "$app/navigation";

	let { data } = $props();
	let chosen = $derived(data.mode);
</script>

<svelte:head>
	<title>{pageTitle("Sign-up · Admin")}</title>
</svelte:head>

<section>
	<h1 class="display">Sign-up</h1>
	<p class="mt-1 text-sm opacity-90">
		Open: anyone creates a free account from Sign up, and the site says so (no waitlist anywhere).
		Invitation-only: a newcomer needs an invitation or an invite code, and the front page, the
		pricing page and the sign-up page offer the waitlist instead. Takes effect within a few seconds;
		nothing about existing accounts changes.
	</p>
	<form
		class="mt-4"
		{...setSignUpModeForm.enhance(async ({ submit }) => {
			await submit();
			if (setSignUpModeForm.result?.mode) {
				await invalidateAll();
				notify(
					setSignUpModeForm.result.mode === "open"
						? "Sign-up is open to everyone"
						: "Sign-up is invitation-only",
				);
			}
		})}
	>
		<ul class="surface divide-y divide-white/10 text-15px">
			{#each [["open", "Open", "Anyone can create a free account. Invitations and codes still work and join their account."], ["invite", "Invitation-only", "An invitation link or an invite code is required; the waitlist collects everyone else."]] as [value, label, blurb] (value)}
				<li>
					<label class="flex cursor-pointer items-start gap-3 px-5 py-3 hover:bg-white/5">
						<input
							class="mt-1"
							type="radio"
							name="mode"
							{value}
							checked={value === chosen}
							onchange={() => (chosen = value as typeof chosen)}
						/>
						<span>
							<span class="block font-600">{label}</span>
							<span class="block text-13px text-dim">{blurb}</span>
						</span>
					</label>
				</li>
			{/each}
		</ul>
		{#each setSignUpModeForm.fields.allIssues() ?? [] as issue (issue.message)}
			<p class="mt-2 text-sm text-red-400">{issue.message}</p>
		{/each}
		<div class="mt-4">
			<button class="button-accent" disabled={!!setSignUpModeForm.pending || chosen === data.mode}>
				{setSignUpModeForm.pending ? "Saving…" : "Save"}
			</button>
		</div>
	</form>
</section>
