<script lang="ts">
	import { reorderSetListItems } from "#lib/remote/setLists.remote.js";
	import type { SetListItemRow } from "#lib/server/data.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { dropIndexAt } from "#lib/utils/dropIndexAt.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import { moveId } from "#lib/utils/moveId.js";
	import { reorderById } from "#lib/utils/reorderById.js";
	import SetListRow from "./SetListRow.svelte";

	/**
	 * A set list's rows in the editor (docs/band-plan.md, "Set list"): each
	 * numbered, its title editable (a song row's own title, empty to follow
	 * the song's, with the song linked under it), a note per row saved on
	 * change, a remove button, and the order changed by
	 * dragging the grip (pointer events, so touch works), its arrow keys or
	 * the up and down buttons, saved once the move is done.
	 */
	interface Props {
		rows: SetListItemRow[];
		setListId: string;
		accountSlug: string;
	}
	let { rows = $bindable(), setListId, accountSlug }: Props = $props();

	type Row = SetListItemRow;
	const ids = () => rows.map((r) => r.id);
	const replace = (row: Row) => (rows = rows.map((r) => (r.id === row.id ? row : r)));

	let dragging = $state<string | null>(null);
	let orderAtStart: string[] = [];

	const gripClass = (id: string) => (dragging === id ? "cursor-grabbing opacity-100" : "");
	function moveTo(id: string, index: number) {
		rows = reorderById(rows, moveId(ids(), id, index));
	}
	async function commit() {
		const now = ids();
		if (!now.some((id, i) => id !== orderAtStart[i])) return;
		try {
			await reorderSetListItems({ setListId, ids: now });
			notify("Order saved");
		} catch (e) {
			rows = reorderById(rows, orderAtStart);
			notify(`Could not save the order: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	function step(row: Row, by: number) {
		orderAtStart = ids();
		moveTo(row.id, orderAtStart.indexOf(row.id) + by);
		void commit();
	}
	function gripDown(e: PointerEvent, row: Row) {
		if (e.button !== 0) return;
		e.preventDefault();
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		dragging = row.id;
		orderAtStart = ids();
	}
	function gripMove(e: PointerEvent, row: Row) {
		const list = (e.currentTarget as HTMLElement).closest("ol");
		if (dragging !== row.id || !list) return;
		const boxes = [...list.querySelectorAll<HTMLElement>("[data-set-list-row]")].map((el) =>
			el.getBoundingClientRect(),
		);
		const index = dropIndexAt(boxes, e.clientY);
		if (ids().indexOf(row.id) !== index) moveTo(row.id, index);
	}
	function gripUp() {
		if (!dragging) return;
		dragging = null;
		void commit();
	}
	function gripKey(e: KeyboardEvent, row: Row) {
		if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
		e.preventDefault();
		step(row, e.key === "ArrowUp" ? -1 : 1);
	}
</script>

{#if rows.length === 0}
	<p class="text-14px text-dim">No rows yet: add a song or a line below.</p>
{:else}
	<ol class="grid gap-2 {dragging ? 'select-none' : ''}" aria-label="Rows of the set list">
		{#each rows as row, i (row.id)}
			<li
				class={["surface flex items-center gap-2 px-2 py-2", dragging === row.id && "opacity-50"]}
				data-set-list-row
			>
				<SetListRow
					{row}
					index={i}
					count={rows.length}
					{accountSlug}
					onmove={(by) => step(row, by)}
					onchanged={replace}
					onremoved={() => (rows = rows.filter((r) => r.id !== row.id))}
				>
					{#snippet grip()}
						<button
							class="shrink-0 cursor-grab touch-none rounded px-0.5 py-2 opacity-50 hover-opacity-100 focus-visible-opacity-100 {gripClass(
								row.id,
							)}"
							type="button"
							aria-label="Move {row.title}"
							title="Drag to reorder, or use the arrow keys"
							onpointerdown={(e) => gripDown(e, row)}
							onpointermove={(e) => gripMove(e, row)}
							onpointerup={gripUp}
							onpointercancel={gripUp}
							onkeydown={(e) => gripKey(e, row)}
						>
							<span class="i-ph-dots-six-vertical block text-18px" aria-hidden="true"></span>
						</button>
					{/snippet}
				</SetListRow>
			</li>
		{/each}
	</ol>
{/if}
