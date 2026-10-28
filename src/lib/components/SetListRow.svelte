<script lang="ts">
	import type { Snippet } from "svelte";
	import { deleteSetListItem, updateSetListItem } from "#lib/remote/setLists.remote.js";
	import type { SetListItemRow } from "#lib/server/data.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";

	/**
	 * One row in the set list editor (SetListRows): its number, its title
	 * to edit, the note saved on change, the up and down buttons and remove.
	 * A song row's title is the band's own for that row ("Interbellum
	 * (acoustic)"): empty, it follows the song's (shown as the placeholder),
	 * and clearing it follows the song again; under it the song itself,
	 * linking to the song (plain text when the person may not open it). A
	 * free-text row's title cannot be emptied: clearing it restores the old
	 * one. The grip comes from the list, which owns the dragging.
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

	/** The row's stored title: a song row's own title ('' follows the song's), a free-text row's text. */
	const storedTitle = $derived(row.songId ? row.customTitle : row.title);

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
		// Emptied, a song row follows the song again; a free-text row keeps its old text.
		const title = input.value.trim() || (row.songId ? "" : row.title);
		input.value = title;
		if (title !== storedTitle) void save(title, row.note);
	}
	function noteChanged(input: HTMLInputElement) {
		const note = input.value.trim();
		if (note !== row.note) void save(storedTitle, note);
	}
</script>

{@render grip()}
<span class="w-6 shrink-0 text-right tabular-nums text-dim">{n}</span>
<div class="grid min-w-0 flex-1 gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-3">
	<div class="grid min-w-0 gap-0.5">
		<input
			class="field py-1 text-14px"
			type="text"
			aria-label="Row {n} title"
			maxlength="120"
			value={storedTitle}
			placeholder={row.songTitle ?? ""}
			onchange={(e) => titleChanged(e.currentTarget)}
		/>
		{#if row.songId}
			<span
				class="flex min-w-0 items-center gap-1 text-12px text-dim"
				title="The song this row plays"
			>
				<span class="i-ph-music-notes shrink-0" aria-hidden="true"></span>
				{#if songHref}
					<a class="link min-w-0 truncate" href={songHref}>{row.songTitle}</a>
				{:else}
					<span class="min-w-0 truncate">{row.songTitle ?? "Archived song"}</span>
				{/if}
			</span>
		{/if}
	</div>
	<input
		class="field self-start py-1 text-13px"
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
