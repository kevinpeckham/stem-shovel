<script lang="ts">
	import { addEventPayout } from "#lib/remote/events.remote.js";
	import type { EventPayoutRow } from "#lib/server/data.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import { formatCents } from "#lib/utils/formatCents.js";
	import EventPayoutFields, {
		emptyDraft,
		payoutInput,
		type PayoutDraft,
	} from "./EventPayoutFields.svelte";
	import PayoutRow from "./EventPayoutRow.svelte";

	/**
	 * A show's payouts (docs/band-plan.md phase 4, "The books"): who was paid
	 * (a member, or anyone by name), how much and why, in order; an editor
	 * edits and removes each inline and adds one under them. The footer sums
	 * what was paid out and, with a take, what is left of it. The rows are
	 * local state kept from what each command returns.
	 */
	interface Props {
		payouts: EventPayoutRow[];
		eventId: string;
		members: { userId: string; name: string }[];
		currency: string;
		takeCents: number | null;
		canEdit: boolean;
	}
	let { payouts = $bindable(), eventId, members, currency, takeCents, canEdit }: Props = $props();

	let draft = $state<PayoutDraft>(emptyDraft());
	let adding = $state(false);

	const paid = $derived(payouts.reduce((sum, p) => sum + p.amountCents, 0));
	const left = $derived(takeCents === null ? null : takeCents - paid);
	const leftText = $derived(
		left === null ? "" : left === 0 ? "nothing left" : `${formatCents(left, currency)} left`,
	);

	async function add(ev: SubmitEvent) {
		ev.preventDefault();
		adding = true;
		try {
			payouts = [...payouts, await addEventPayout({ eventId, ...payoutInput(draft) })];
			draft = emptyDraft();
		} catch (e) {
			notify(`Could not add the payout: ${errorMessage(e)}`, { kind: "error" });
		} finally {
			adding = false;
		}
	}
</script>

{#snippet rows()}
	<ul class="grid gap-2" aria-label="Payouts">
		{#each payouts as row (row.id)}
			<li class="surface flex items-center gap-2 px-3 py-2">
				<PayoutRow
					{row}
					{members}
					{currency}
					{canEdit}
					onchanged={(saved) => (payouts = payouts.map((p) => (p.id === saved.id ? saved : p)))}
					onremoved={() => (payouts = payouts.filter((p) => p.id !== row.id))}
				/>
			</li>
		{/each}
	</ul>
	<p class="text-13px text-dim">
		<span>Paid out {formatCents(paid, currency)}</span>
		{#if leftText}·
			<span class={left !== null && left < 0 ? "text-red-400" : ""}>{leftText}</span>{/if}
	</p>
{/snippet}

{#if payouts.length}
	{@render rows()}
{:else if !canEdit}
	<p class="text-14px text-dim">No payouts recorded.</p>
{/if}

{#if canEdit}
	<form class="grid gap-2" aria-label="Add a payout" onsubmit={add}>
		<EventPayoutFields bind:draft {members} label="New payout" disabled={adding} />
		<div>
			<button class="button button-sm" disabled={adding}>
				<span class="i-ph-plus" aria-hidden="true"></span> Add payout
			</button>
		</div>
	</form>
{/if}
