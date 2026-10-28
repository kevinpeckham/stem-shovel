<script lang="ts">
	import LocationNew from "#lib/components/LocationNew.svelte";
	import type { PracticeLocationChoice, PracticeLocationRow } from "#lib/server/data.js";

	/**
	 * A practice location picker: "No location", the account's locations by
	 * name, and, for someone who may add one, "New location…", which opens
	 * LocationNew and keeps the select on its previous choice until a
	 * location is added (then it takes that one). A parent remote form posts
	 * the choice through its own hidden field
	 * (`form.fields.locationId.as("hidden", locationId)`).
	 */
	let {
		choices,
		value = $bindable(""),
		accountId,
		canCreate,
		onadded,
	}: {
		choices: PracticeLocationChoice[];
		/** The chosen location's id, '' for none. */
		value?: string;
		accountId: string;
		canCreate: boolean;
		onadded?: (row: PracticeLocationRow) => void;
	} = $props();

	const NEW = "__new";
	const uid = $props.id();
	const popoverId = `location-new-${uid}`;
	/** Locations added here since the page loaded, until the page data has them. */
	let extra = $state<PracticeLocationChoice[]>([]);
	const listed = $derived(choices.concat(extra.filter((x) => !choices.some((c) => c.id === x.id))));

	function pick(e: Event & { currentTarget: HTMLSelectElement }) {
		if (e.currentTarget.value === NEW) {
			e.currentTarget.value = value;
			document.getElementById(popoverId)?.showPopover();
		} else value = e.currentTarget.value;
	}

	function added(row: PracticeLocationRow) {
		if (!extra.some((x) => x.id === row.id)) extra.push({ id: row.id, name: row.name });
		value = row.id;
		onadded?.(row);
	}
</script>

<select class="field text-14px" aria-label="Location" {value} onchange={pick}>
	<option value="">No location</option>
	{#each listed as l (l.id)}
		<option value={l.id}>{l.name}</option>
	{/each}
	{#if canCreate}<option value={NEW}>New location…</option>{/if}
</select>
{#if canCreate}
	<LocationNew id={popoverId} {accountId} onadded={added} />
{/if}
