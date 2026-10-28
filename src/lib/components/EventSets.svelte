<script lang="ts">
	import { addEventSet, reorderEventSets } from "#lib/remote/events.remote.js";
	import type { EventSetRow } from "#lib/server/data.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { dropIndexAt } from "#lib/utils/dropIndexAt.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import { moveId } from "#lib/utils/moveId.js";
	import { plural } from "#lib/utils/plural.js";
	import { reorderById } from "#lib/utils/reorderById.js";
	import SetRow from "./EventSetRow.svelte";

	/**
	 * An event's sets (docs/band-plan.md, "Event"): the set lists attached in
	 * order, each numbered with a label ("Set 1", "Encore") saved on change,
	 * its editor and show view linked, and Remove; the order changed by
	 * dragging the grip (pointer events, so touch works), its arrow keys or
	 * the up and down buttons, saved once the move is done. Under them a set
	 * list to attach as the next set. The rows are local state kept from
	 * what each command returns.
	 */
	interface Props {
		sets: EventSetRow[];
		eventId: string;
		accountSlug: string;
		choices: { id: string; title: string; itemCount: number }[];
		canEdit: boolean;
	}
	let { sets = $bindable(), eventId, accountSlug, choices, canEdit }: Props = $props();

	const ids = () => sets.map((s) => s.id);
	let dragging = $state<string | null>(null);
	let orderAtStart: string[] = [];
	let picked = $state("");
	let adding = $state(false);

	function moveTo(id: string, index: number) {
		sets = reorderById(sets, moveId(ids(), id, index));
	}
	async function commit() {
		const now = ids();
		if (!now.some((id, i) => id !== orderAtStart[i])) return;
		try {
			await reorderEventSets({ eventId, ids: now });
			notify("Order saved");
		} catch (e) {
			sets = reorderById(sets, orderAtStart);
			notify(`Could not save the order: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	function step(row: EventSetRow, by: number) {
		orderAtStart = ids();
		moveTo(row.id, orderAtStart.indexOf(row.id) + by);
		void commit();
	}
	function gripDown(e: PointerEvent, row: EventSetRow) {
		if (e.button !== 0) return;
		e.preventDefault();
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		dragging = row.id;
		orderAtStart = ids();
	}
	function gripMove(e: PointerEvent, row: EventSetRow) {
		const list = (e.currentTarget as HTMLElement).closest("ol");
		if (dragging !== row.id || !list) return;
		const boxes = [...list.querySelectorAll<HTMLElement>("[data-event-set]")].map((el) =>
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
	function gripKey(e: KeyboardEvent, row: EventSetRow) {
		if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
		e.preventDefault();
		step(row, e.key === "ArrowUp" ? -1 : 1);
	}

	const rowClass = (id: string) => (dragging === id ? "opacity-50" : "");
	const gripClass = (id: string) => (dragging === id ? "cursor-grabbing opacity-100" : "");
	const choiceLabel = (c: Props["choices"][number]) =>
		`${c.title || "Untitled"} · ${plural(c.itemCount, "row")}`;
	function replace(saved: EventSetRow) {
		sets = sets.map((s) => (s.id === saved.id ? saved : s));
	}
	async function attach() {
		if (!picked) return;
		adding = true;
		try {
			sets = [...sets, await addEventSet({ eventId, setListId: picked })];
			picked = "";
		} catch (e) {
			notify(`Could not attach the set list: ${errorMessage(e)}`, { kind: "error" });
		} finally {
			adding = false;
		}
	}
</script>

{#if sets.length === 0}
	<p class="text-14px text-dim">No sets yet.</p>
{:else}
	<ol class="grid gap-2 {dragging ? 'select-none' : ''}" aria-label="Sets">
		{#each sets as row, i (row.id)}
			<li class="surface flex items-center gap-2 px-2 py-2 {rowClass(row.id)}" data-event-set>
				<SetRow
					{row}
					index={i}
					count={sets.length}
					{accountSlug}
					{canEdit}
					onmove={(by) => step(row, by)}
					onchanged={replace}
					onremoved={() => (sets = sets.filter((s) => s.id !== row.id))}
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
				</SetRow>
			</li>
		{/each}
	</ol>
{/if}

{#if canEdit}
	{#if choices.length === 0}
		<p class="text-14px text-dim">
			No set lists yet. <a class="link" href="/{accountSlug}/set-lists">Make one on Set lists</a>.
		</p>
	{:else}
		<div class="flex flex-wrap items-end gap-2">
			<label class="grid min-w-0 flex-1 gap-1 text-13px text-dim sm:max-w-sm">
				Attach a set list
				<select class="field text-14px" bind:value={picked}>
					<option value="" disabled>Choose a set list</option>
					{#each choices as c (c.id)}
						<option value={c.id}>{choiceLabel(c)}</option>
					{/each}
				</select>
			</label>
			<button class="button button-sm" type="button" disabled={!picked || adding} onclick={attach}>
				<span class="i-ph-plus" aria-hidden="true"></span> Attach
			</button>
		</div>
	{/if}
{/if}
