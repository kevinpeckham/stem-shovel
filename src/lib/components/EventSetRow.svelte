<script lang="ts">
	import type { Snippet } from "svelte";
	import { removeEventSet, updateEventSetLabel } from "#lib/remote/events.remote.js";
	import type { EventSetRow } from "#lib/server/data.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import { plural } from "#lib/utils/plural.js";

	/**
	 * One set of an event (EventSets): its number, its set list linked with
	 * the row count and the show view, the label saved on change ("Set 1",
	 * "Encore"), and for an editor the up and down buttons and Remove. The
	 * grip comes from the list, which owns the dragging.
	 */
	interface Props {
		row: EventSetRow;
		index: number;
		count: number;
		accountSlug: string;
		canEdit: boolean;
		grip: Snippet;
		onmove: (by: number) => void;
		onchanged: (row: EventSetRow) => void;
		onremoved: () => void;
	}
	let { row, index, count, accountSlug, canEdit, grip, onmove, onchanged, onremoved }: Props =
		$props();

	const n = $derived(index + 1);
	const href = $derived(`/${accountSlug}/set-lists/${row.setListId}`);

	async function saveLabel(input: HTMLInputElement) {
		const label = input.value.trim();
		input.value = label;
		if (label === row.label) return;
		try {
			onchanged(await updateEventSetLabel({ id: row.id, label }));
		} catch (e) {
			notify(`Could not save the label: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	async function remove() {
		try {
			await removeEventSet({ id: row.id });
			onremoved();
		} catch (e) {
			notify(`Could not remove the set: ${errorMessage(e)}`, { kind: "error" });
		}
	}
</script>

{#if canEdit}
	{@render grip()}
{/if}
<span class="w-6 shrink-0 text-right tabular-nums text-dim">{n}</span>
<div class="grid min-w-0 flex-1 gap-1 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-center sm:gap-3">
	<div class="flex min-w-0 flex-wrap items-baseline gap-x-2">
		<a class="link min-w-0 truncate text-14px" {href}>{row.title || "Untitled"}</a>
		<span class="text-12px text-dim">{plural(row.itemCount, "row")}</span>
		<a class="link text-12px" href="{href}/show">Show view</a>
	</div>
	{#if canEdit}
		<input
			class="field py-1 text-13px"
			type="text"
			aria-label="Label of set {n}"
			placeholder="Set {n}"
			maxlength="60"
			value={row.label}
			onchange={(e) => saveLabel(e.currentTarget)}
		/>
	{:else if row.label}
		<span class="text-13px">{row.label}</span>
	{/if}
</div>
{#if canEdit}
	<div class="flex shrink-0 items-center">
		<button
			class="rounded p-1 opacity-70 hover-opacity-100 disabled:opacity-25"
			type="button"
			aria-label="Move {row.title} up"
			title="Move up"
			disabled={index === 0}
			onclick={() => onmove(-1)}
		>
			<span class="i-ph-arrow-up block" aria-hidden="true"></span>
		</button>
		<button
			class="rounded p-1 opacity-70 hover-opacity-100 disabled:opacity-25"
			type="button"
			aria-label="Move {row.title} down"
			title="Move down"
			disabled={index === count - 1}
			onclick={() => onmove(1)}
		>
			<span class="i-ph-arrow-down block" aria-hidden="true"></span>
		</button>
		<button
			class="rounded p-1 opacity-70 hover-opacity-100 hover-text-red-400"
			type="button"
			aria-label="Remove {row.title}"
			title="Remove this set (the set list stays)"
			onclick={remove}
		>
			<span class="i-ph-x block" aria-hidden="true"></span>
		</button>
	</div>
{/if}
