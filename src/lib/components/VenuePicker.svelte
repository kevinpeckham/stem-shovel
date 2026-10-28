<script lang="ts">
	import VenueFind from "#lib/components/VenueFind.svelte";
	import type { VenueChoice, VenueRow } from "#lib/server/data.js";

	/**
	 * A venue picker: "No venue", the account's venues ("{name} · {city}"),
	 * and, for someone who may add one, "Find or add a venue…", which opens
	 * VenueFind and leaves the select where it was until a venue is added
	 * (then it takes that one; Cancel or Escape changes nothing). A parent
	 * remote form posts the choice through its own hidden field
	 * (`form.fields.venueId.as("hidden", venueId)`: SvelteKit refuses a
	 * field it did not make, `form_field_unbound`).
	 */
	let {
		choices,
		value = $bindable(""),
		accountId,
		canCreate,
		onadded,
	}: {
		choices: VenueChoice[];
		/** The chosen venue's id, '' for none. */
		value?: string;
		accountId: string;
		canCreate: boolean;
		onadded?: (v: VenueRow) => void;
	} = $props();

	const FIND = "__find";
	const uid = $props.id();
	const popoverId = `venue-find-${uid}`;
	/** Venues added here since the page loaded, until the page data has them. */
	let added = $state<VenueChoice[]>([]);
	const options = $derived([
		...choices,
		...added.filter((a) => !choices.some((c) => c.id === a.id)),
	]);

	function onchange(e: Event & { currentTarget: HTMLSelectElement }) {
		const picked = e.currentTarget.value;
		if (picked !== FIND) {
			value = picked;
			return;
		}
		// Back to the previous choice until a venue is added.
		e.currentTarget.value = value;
		document.getElementById(popoverId)?.showPopover();
	}
</script>

<select class="field text-14px" aria-label="Venue" {value} {onchange}>
	<option value="">No venue</option>
	{#each options as v (v.id)}
		<option value={v.id}>{v.city ? `${v.name} · ${v.city}` : v.name}</option>
	{/each}
	{#if canCreate}
		<option value={FIND}>Find or add a venue…</option>
	{/if}
</select>
{#if canCreate}
	<VenueFind
		id={popoverId}
		{accountId}
		onadded={(row) => {
			if (!added.some((a) => a.id === row.id))
				added.push({ id: row.id, name: row.name, city: row.city });
			value = row.id;
			onadded?.(row);
		}}
	/>
{/if}
