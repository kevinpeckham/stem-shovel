<script lang="ts">
	import { leaveAccount } from "$lib/remote/accounts.remote";
	import { notify } from "$lib/state/notifications.svelte";

	let { data } = $props();
</script>

<svelte:head>
	<title>Your accounts — Stem Shovel</title>
</svelte:head>

<main class="page">
	<header class="max-w-article">
		<h1 class="display">Your accounts</h1>
		<p class="opacity-90">Every workspace you belong to, and your role in each.</p>
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
</main>
