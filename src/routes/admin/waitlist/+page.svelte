<script lang="ts">
	import { manageWaitlist } from "$lib/remote/admin.remote";
	import { formatDate } from "$lib/utils/formatDate";
	import { formatInviteCode } from "$lib/utils/formatInviteCode";
	import { notify } from "$lib/state/notifications.svelte";

	let { data } = $props();
	let counts = $derived({
		confirmed: data.entries.filter((e) => e.status === "confirmed").length,
		pending: data.entries.filter((e) => e.status === "pending").length,
		invited: data.entries.filter((e) => e.status === "invited").length,
		updates: data.entries.filter((e) => e.status !== "removed" && e.updatesOk).length,
	});
</script>

<svelte:head>
	<title>Waitlist · Admin — Stem Shovel</title>
</svelte:head>

<section>
	<h1 class="display">Waitlist</h1>
	<p class="mt-1 text-sm opacity-90">
		{counts.confirmed} confirmed · {counts.pending} waiting for confirmation · {counts.invited} invited
		· {counts.updates} said yes to project updates. "Invite" makes a single-use new-account code (30 days)
		and emails it; only confirmed addresses can be invited.
	</p>
	{#if data.entries.length === 0}
		<p class="mt-4 text-dim">Nobody yet.</p>
	{:else}
		<ul class="mt-4 surface divide-y divide-white/10 text-15px">
			{#each data.entries as e (e.id)}
				{@const act = manageWaitlist.for(e.id)}
				<li
					class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3 {e.status ===
					'removed'
						? 'opacity-50'
						: ''}"
				>
					<span class="min-w-0">
						<span class="font-600">{e.email}</span>
						{#if e.name}<span class="text-dim">· {e.name}</span>{/if}
						<span class="block text-13px text-dim">
							<span class="uppercase tracking-wider">{e.status}</span>
							· {formatDate(e.createdAt)}{#if e.confirmedAt}
								· confirmed {formatDate(e.confirmedAt)}{/if}{#if e.updatesOk}
								· updates ok{/if}{#if e.inviteCode}
								· code {formatInviteCode(e.inviteCode.code)}{e.inviteCode.uses > 0
									? " (used)"
									: ""}{/if}{#if e.source}
								· from {e.source}{/if}
						</span>
					</span>
					<form
						class="flex items-center gap-3 text-13px"
						{...act.enhance(async ({ submit }) => {
							const action = act.fields.action.value();
							if (action === "remove" && !confirm(`Remove ${e.email} from the waitlist?`)) return;
							await submit();
							if (act.result?.action)
								notify(
									act.result.action === "invite"
										? `Invite sent to ${e.email}`
										: act.result.action === "resend"
											? `Confirmation resent to ${e.email}`
											: `${e.email} removed`,
								);
						})}
					>
						<input {...act.fields.id.as("hidden", e.id)} />
						{#if e.status === "confirmed"}
							<button
								class="link-dim"
								disabled={!!act.pending}
								{...act.fields.action.as("submit", "invite")}
							>
								Invite
							</button>
						{:else if e.status === "pending"}
							<button
								class="link-dim"
								disabled={!!act.pending}
								{...act.fields.action.as("submit", "resend")}
							>
								Resend confirmation
							</button>
						{/if}
						<button
							class="text-red-400 hover:underline"
							disabled={!!act.pending}
							{...act.fields.action.as("submit", "remove")}
						>
							Remove
						</button>
					</form>
				</li>
			{/each}
		</ul>
	{/if}
</section>
