<script lang="ts">
	import type { Snippet } from "svelte";
	import { deleteSetListItem, updateSetListItem } from "#lib/remote/setLists.remote.js";
	import type { SetListItemRow } from "#lib/server/data.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";

	/**
	 * One row in the set list editor (SetListRows): its number, a song's
	 * title linking to the song (plain text when the person may not open
	 * it) or a free-text row's title to edit, the note saved on change, the
	 * up and down buttons and remove. The grip comes from the list, which
	 * owns the dragging.
	 */
	interface Props {
		row: SetListItemRow;
		index: number;
		count: number;
		accountSlug: string;
		grip: Snippet;
		onmove: (by: number) => void;
		onchanged: (row: SetListItemRow) => void;
		onremoved: () => void;
	}
	let { row, index, count, accountSlug, grip, onmove, onchanged, onremoved }: Props = $props();

	const n = $derived(index + 1);
	const songHref = $derived(
		row.song ? `/${accountSlug}/projects/${row.song.project.slug}/${row.song.slug}` : null,
	);

	/** A song row's title is the song's: the server ignores the one sent. */
	async function save(title: string, note: string) {
		try {
			onchanged(await updateSetListItem({ id: row.id, title, note }));
		} catch (e) {
			notify(`Could not save the row: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	async function remove() {
		try {
			await deleteSetListItem({ id: row.id });
			onremoved();
		} catch (e) {
			notify(`Could not remove the row: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	function titleChanged(input: HTMLInputElement) {
		const title = input.value.trim();
		if (!title) input.value = row.title;
		else if (title !== row.title) void save(title, row.note);
	}
	function noteChanged(input: HTMLInputElement) {
		const note = input.value.trim();
		if (note !== row.note) void save(row.title, note);
	}
</script>

{@render grip()}
<span class="w-6 shrink-0 text-right tabular-nums text-dim">{n}</span>
<div class="grid min-w-0 flex-1 gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-3">
	{#if songHref}
		<a
			class="link min-w-0 truncate self-center"
			href={songHref}
			title="Open {row.title} ({row.song?.project.name})">{row.title}</a
		>
	{:else if row.songId}
		<span class="min-w-0 truncate self-center" title="A song you cannot open here">{row.title}</span
		>
	{:else}
		<input
			class="field py-1 text-14px"
			type="text"
			aria-label="Row {n} title"
			maxlength="120"
			value={row.title}
			onchange={(e) => titleChanged(e.currentTarget)}
		/>
	{/if}
	<input
		class="field py-1 text-13px"
		type="text"
		placeholder="Note: the key tonight, who counts in"
		aria-label="Row {n} note"
		maxlength="200"
		value={row.note}
		onchange={(e) => noteChanged(e.currentTarget)}
	/>
</div>
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
		title="Remove this row"
		onclick={remove}
	>
		<span class="i-ph-x block" aria-hidden="true"></span>
	</button>
</div>
