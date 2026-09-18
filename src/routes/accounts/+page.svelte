<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";
	import PlanBadge from "$lib/components/PlanBadge.svelte";
	import { createAccount, leaveAccount } from "$lib/remote/accounts.remote";
	import { clearForm } from "$lib/utils/clearForm";
	import { page } from "$app/state";
	import { notify } from "$lib/state/notifications.svelte";

	let { data } = $props();
	let newPanel = $state<HTMLDivElement | null>(null);
	// The account menu's "New account" lands here with ?new=1.
	$effect(() => {
		if (page.url.searchParams.get("new") === "1") newPanel?.showPopover();
	});
</script>

<svelte:head>
	<title>{pageTitle("Your accounts")}</title>
</svelte:head>

<main class="page">
	<header class="flex flex-wrap items-baseline justify-between gap-4 max-w-article">
		<div>
			<h1 class="display">Your accounts</h1>
			<p class="opacity-90">Every workspace you belong to, and your role in each.</p>
		</div>
		{#if data.accounts.length > 0}
			<button class="button button-sm" type="button" popovertarget="new-account">
				<span class="i-ph-plus" aria-hidden="true"></span>
				New account
			</button>
		{/if}
	</header>

	<section class="max-w-article">
		{#if data.accounts.length === 0}
			<p class="text-dim">You do not belong to any account yet. Ask for an invitation.</p>
		{:else}
			<ul class="surface divide-y divide-white/10 text-15px">
				{#each data.accounts as a (a.accountId)}
					{@const leave = leaveAccount.for(a.accountId)}
					<li
						class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3 {a.status ===
						'active'
							? ''
							: 'opacity-60'}"
					>
						<span>
							<a class="link-dim" href="/{a.slug}/projects">{a.name}</a>
							<PlanBadge plan={a.plan} lifetimeFree={a.lifetimeFree} isFounder={a.isFounder} />
							<span class="block text-13px text-dim">
								<span class="uppercase tracking-wider">{a.role}</span>
								· {a.projects}
								{a.projects === 1 ? "project" : "projects"}{#if a.status !== "active"}
									· <span class="uppercase tracking-wider">{a.status}</span>{/if}
							</span>
						</span>
						<span class="flex items-center gap-4 text-13px">
							{#if a.role === "owner" || a.role === "admin"}
								<a class="link-dim" href="/{a.slug}/settings">Settings</a>
							{/if}
							{#if a.canLeave}
								<form
									{...leave.enhance(async ({ submit }) => {
										if (!confirm(`Leave ${a.name}? You will need a new invitation to come back.`))
											return;
										await submit();
										const issue = leave.fields.allIssues()?.[0];
										if (issue) notify(issue.message, { kind: "error" });
									})}
								>
									<input {...leave.fields.accountId.as("hidden", a.accountId)} />
									<button class="link-dim" disabled={!!leave.pending}>
										{leave.pending ? "Leaving…" : "Leave"}
									</button>
								</form>
							{:else}
								<span class="text-dim" title="Make someone else an owner first">Only owner</span>
							{/if}
						</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if data.accounts.length > 0}
		<div
			id="new-account"
			popover="auto"
			bind:this={newPanel}
			onbeforetoggle={(e) => {
				if (e.newState === "open") clearForm(createAccount);
			}}
			class="m-auto max-h-[calc(100vh-2rem)] overflow-y-auto w-[min(32rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
		>
			<div class="mb-4 flex items-center justify-between gap-4">
				<h2 class="heading-2 mb-0">New account</h2>
				<button
					class="button button-xs"
					type="button"
					popovertarget="new-account"
					popovertargetaction="hide"
				>
					Close
				</button>
			</div>
			<form
				{...createAccount.enhance(async ({ submit }) => {
					await submit();
					// Redirects to the new account's projects on success; only issues keep us here.
					if (!createAccount.fields.allIssues()) newPanel?.hidePopover();
				})}
			>
				<label class="block">
					<span class="text-sm text-dim">Name</span>
					<input
						class="mt-1 field"
						{...createAccount.fields.name.as("text")}
						placeholder="A band, a studio, a client"
						autocomplete="off"
						required
					/>
					{#each createAccount.fields.name.issues() ?? [] as issue (issue.message)}
						<p class="mt-1 text-sm text-red-400">{issue.message}</p>
					{/each}
				</label>
				<p class="mt-2 text-xs text-dim">
					You will be its owner. Invite people from its settings; the address comes from the name
					and can be changed there.
				</p>
				<div class="mt-4">
					<button class="button-accent disabled:opacity-40" disabled={!!createAccount.pending}>
						{createAccount.pending ? "Creating…" : "Create account"}
					</button>
				</div>
			</form>
		</div>
	{/if}
</main>
