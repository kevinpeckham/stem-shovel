<script lang="ts" module>
	import type { EventPayoutRow } from "#lib/server/data.js";
	import { centsText } from "#lib/utils/centsText.js";

	/** What "Someone else…" posts as the choice: the name input then says who. */
	export const SOMEONE_ELSE = "other";

	/** A payout as its controls hold it: `who` is a member's id, `SOMEONE_ELSE`, or "" before a choice. */
	export type PayoutDraft = { who: string; name: string; amount: string; note: string };

	/** An empty draft, for the add form. */
	export const emptyDraft = (): PayoutDraft => ({ who: "", name: "", amount: "", note: "" });

	/** A saved payout as a draft: a member still on the account by id, anyone else by name. */
	export function draftOf(row: EventPayoutRow, members: { userId: string }[]): PayoutDraft {
		const member = row.userId !== null && members.some((m) => m.userId === row.userId);
		return {
			who: member ? (row.userId ?? "") : SOMEONE_ELSE,
			name: member ? "" : row.name,
			amount: centsText(row.amountCents),
			note: row.note,
		};
	}

	/** The command's fields for a draft: a member's id, else "" and the typed name. */
	export function payoutInput(d: PayoutDraft) {
		const other = d.who === SOMEONE_ELSE || d.who === "";
		return {
			userId: other ? "" : d.who,
			name: other ? d.name.trim() : "",
			amount: d.amount.trim(),
			note: d.note.trim(),
		};
	}
</script>

<script lang="ts">
	/**
	 * The controls of one payout (EventPayouts' add form, EventPayoutRow's
	 * editor): who (a member of the account, or "Someone else…" with a name
	 * input), the amount as text, and a note.
	 */
	let {
		draft = $bindable(),
		members,
		label,
		disabled = false,
	}: {
		draft: PayoutDraft;
		members: { userId: string; name: string }[];
		/** Prefixes the controls' accessible names ("New payout", "Payout to Sam"). */
		label: string;
		disabled?: boolean;
	} = $props();
</script>

<div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_minmax(0,1fr)]">
	<div class="grid min-w-0 gap-2">
		<select
			class="field py-1 text-13px"
			aria-label="{label}: who"
			{disabled}
			bind:value={draft.who}
		>
			<option value="" disabled>Who…</option>
			{#each members as m (m.userId)}
				<option value={m.userId}>{m.name}</option>
			{/each}
			<option value={SOMEONE_ELSE}>Someone else…</option>
		</select>
		{#if draft.who === SOMEONE_ELSE}
			<input
				class="field py-1 text-13px"
				type="text"
				aria-label="{label}: name"
				placeholder="Name"
				maxlength="120"
				{disabled}
				bind:value={draft.name}
			/>
		{/if}
	</div>
	<input
		class="field self-start py-1 text-13px"
		type="text"
		inputmode="decimal"
		aria-label="{label}: amount"
		placeholder="Amount"
		{disabled}
		bind:value={draft.amount}
	/>
	<input
		class="field self-start py-1 text-13px"
		type="text"
		aria-label="{label}: note"
		placeholder="Note"
		maxlength="400"
		{disabled}
		bind:value={draft.note}
	/>
</div>
