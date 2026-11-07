<script lang="ts">
	import MemberProfileForm from "#lib/components/MemberProfileForm.svelte";
	import type { MemberProfileRow } from "#lib/server/data.js";

	/**
	 * A member on the Members page: name, role, email, phone, instruments
	 * and notes. `canEdit` (their own row, or an owner or admin) adds Edit,
	 * which swaps the row for MemberProfileForm until Save or Cancel.
	 */
	let {
		member: m,
		accountId,
		canEdit,
	}: { member: MemberProfileRow; accountId: string; canEdit: boolean } = $props();

	let editing = $state(false);
</script>

<div class="grid gap-2">
	<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
		<span class="app-tile-heading">{m.name}</span>
		<span class="text-11px uppercase tracking-wider text-dim">{m.role}</span>
		{#if canEdit && !editing}
			<button
				class="button button-sm ml-auto"
				type="button"
				aria-label="Edit {m.name}'s profile"
				onclick={() => (editing = true)}
			>
				<span class="i-ph-pencil-simple" aria-hidden="true"></span> Edit
			</button>
		{/if}
	</div>
	{#if editing}
		<MemberProfileForm member={m} {accountId} onclose={() => (editing = false)} />
	{:else}
		<p class="text-14px">
			<a class="link" href="mailto:{m.email}">{m.email}</a>
			{#if m.phone}
				<span class="mx-1 text-dim">·</span><a class="link" href="tel:{m.phone}">{m.phone}</a>
			{/if}
		</p>
		{#if m.instruments}<p class="text-14px">{m.instruments}</p>{/if}
		{#if m.notes}<p class="whitespace-pre-line text-13px text-dim">{m.notes}</p>{/if}
	{/if}
</div>
