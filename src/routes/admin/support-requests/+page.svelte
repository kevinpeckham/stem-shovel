<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";
	import { deleteSupportRequest, setSupportStatus } from "$lib/remote/support.remote";
	import { formatDate } from "$lib/utils/formatDate";
	import { notify } from "$lib/state/notifications.svelte";

	let { data } = $props();
</script>

<svelte:head>
	<title>{pageTitle("Support requests · Admin")}</title>
</svelte:head>

<section>
	<h1 class="display">Support requests</h1>
	<p class="mt-1 mb-4 text-sm opacity-90">
		What people sent from /support, newest first, open ones before closed. "challenge" means a
		visitor proved the email by picking their account out of the line-up; "signed-in" means a
		member.
	</p>
	{#if data.requests.length === 0}
		<p class="text-dim">None yet.</p>
	{:else}
		<ul class="surface divide-y divide-white/10 text-15px">
			{#each data.requests as r (r.id)}
				{@const toggle = setSupportStatus.for(r.id)}
				{@const remove = deleteSupportRequest.for(r.id)}
				<li class="px-5 py-3 {r.status === 'closed' ? 'opacity-50' : ''}">
					<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
						<span class="font-600">
							<a class="link-dim" href="mailto:{r.email}">{r.email}</a>
							{#if r.sender?.name}<span class="text-dim">· {r.sender.name}</span>{/if}
						</span>
						<span class="text-13px text-dim">
							{#if r.account}
								<a class="link-dim" href="/{r.account.slug}/projects">{r.account.name}</a> ·
							{/if}
							{r.verifiedBy} · {formatDate(r.createdAt)}
							{#if r.status === "closed"}
								· <span class="uppercase tracking-wider">closed</span>
							{/if}
						</span>
					</div>
					<p class="mt-1 whitespace-pre-wrap text-sm">{r.message}</p>
					<div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-13px text-dim">
						{#if r.userAgent}
							<span class="truncate max-w-full" title={r.userAgent}>{r.userAgent}</span>
						{/if}
						{#if r.ipAddress}<span>{r.ipAddress}</span>{/if}
						<form
							{...toggle.enhance(async ({ submit }) => {
								await submit();
								if (toggle.result?.status) notify(`Request ${toggle.result.status}`);
							})}
						>
							<input {...toggle.fields.id.as("hidden", r.id)} />
							<input
								{...toggle.fields.status.as("hidden", r.status === "open" ? "closed" : "open")}
							/>
							<button class="link-dim" disabled={!!toggle.pending}>
								{r.status === "open" ? "Close" : "Reopen"}
							</button>
						</form>
						<form
							{...remove.enhance(async ({ submit }) => {
								if (!confirm(`Delete the request from ${r.email}?`)) return;
								await submit();
								if (remove.result?.deleted) notify("Request deleted");
							})}
						>
							<input {...remove.fields.id.as("hidden", r.id)} />
							<button class="text-red-400 hover:underline" disabled={!!remove.pending}
								>Delete</button
							>
						</form>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>
