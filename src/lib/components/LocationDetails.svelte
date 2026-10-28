<script lang="ts">
	import { directionsUrl } from "#lib/utils/directionsUrl.js";

	/**
	 * A practice location's details, read-only (the event page's When and
	 * where for a practice): the address, a Directions link when there is
	 * one, the notes and an Edit location link.
	 */
	let {
		location,
		editHref,
	}: {
		location: { name: string; address: string; notes: string };
		editHref: string;
	} = $props();

	const address = $derived(location.address.trim());
	const notes = $derived(location.notes.trim());
	const directions = $derived(
		address ? directionsUrl({ name: location.name, address: location.address }) : "",
	);
</script>

<div class="grid gap-2 text-14px" role="group" aria-label="Location details">
	{#if address}<p>{address}</p>{/if}
	<p class="flex flex-wrap items-center gap-x-4 gap-y-1">
		{#if directions}
			<a
				class="link inline-flex items-center gap-1"
				href={directions}
				target="_blank"
				rel="noopener"
			>
				<span class="i-ph-map-pin" aria-hidden="true"></span> Directions
			</a>
		{/if}
		<a class="link" href={editHref}>Edit location</a>
	</p>
	{#if notes}
		<div class="grid gap-1">
			<span class="text-13px text-dim">Notes</span>
			<p class="whitespace-pre-line text-dim">{notes}</p>
		</div>
	{/if}
</div>
