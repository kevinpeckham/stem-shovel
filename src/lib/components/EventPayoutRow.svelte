<script lang="ts">
	import { removeEventPayout, updateEventPayout } from "#lib/remote/events.remote.js";
	import type { EventPayoutRow } from "#lib/server/data.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import { formatCents } from "#lib/utils/formatCents.js";
	import EventPayoutFields, {
		draftOf,
		payoutInput,
		type PayoutDraft,
	} from "./EventPayoutFields.svelte";

	/**
	 * One payout of a show (EventPayouts): who, the amount and the note; for
	 * an editor, Edit (the same controls inline, Save and Cancel) and Remove
	 * (confirmed).
	 */
	interface Props {
		row: EventPayoutRow;
		members: { userId: string; name: string }[];
		currency: string;
		canEdit: boolean;
		onchanged: (row: EventPayoutRow) => void;
		onremoved: () => void;
	}
	let { row, members, currency, canEdit, onchanged, onremoved }: Props = $props();

	const who = $derived(row.name || "Someone");
	let draft = $state<PayoutDraft | null>(null);
	let busy = $state(false);

	async function save(d: PayoutDraft) {
		busy = true;
		try {
			onchanged(await updateEventPayout({ id: row.id, ...payoutInput(d) }));
			draft = null;
		} catch (e) {
			notify(`Could not save the payout: ${errorMessage(e)}`, { kind: "error" });
		} finally {
			busy = false;
		}
	}
	async function remove() {
		if (!confirm(`Remove the payout to ${who}?`)) return;
		busy = true;
		try {
			await removeEventPayout({ id: row.id });
			onremoved();
		} catch (e) {
			notify(`Could not remove the payout: ${errorMessage(e)}`, { kind: "error" });
			busy = false;
		}
	}
</script>

{#if draft}
	<form
		class="grid flex-1 gap-2"
		onsubmit={(e) => {
			e.preventDefault();
			if (draft) void save(draft);
		}}
	>
		<EventPayoutFields bind:draft {members} label="Payout to {who}" disabled={busy} />
		<div class="flex gap-2">
			<button class="button button-sm button-accent" disabled={busy}>Save</button>
			<button class="button button-sm" type="button" disabled={busy} onclick={() => (draft = null)}>
				Cancel
			</button>
		</div>
	</form>
{:else}
	<div class="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3">
		<span class="text-14px">{who}</span>
		<span class="text-14px tabular-nums">{formatCents(row.amountCents, currency)}</span>
		{#if row.note}<span class="min-w-0 text-13px text-dim">{row.note}</span>{/if}
	</div>
	{#if canEdit}
		<div class="flex shrink-0 items-center">
			<button
				class="rounded p-1 opacity-70 hover-opacity-100"
				type="button"
				aria-label="Edit the payout to {who}"
				title="Edit"
				disabled={busy}
				onclick={() => (draft = draftOf(row, members))}
			>
				<span class="i-ph-pencil-simple block" aria-hidden="true"></span>
			</button>
			<button
				class="rounded p-1 opacity-70 hover-opacity-100 hover-text-red-400"
				type="button"
				aria-label="Remove the payout to {who}"
				title="Remove"
				disabled={busy}
				onclick={remove}
			>
				<span class="i-ph-x block" aria-hidden="true"></span>
			</button>
		</div>
	{/if}
{/if}
