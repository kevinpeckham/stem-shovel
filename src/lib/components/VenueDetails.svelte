<script lang="ts">
	/**
	 * A venue's details, read-only (the event page's When and where): address
	 * and city, Directions and Website links, an Edit venue link (`editHref`),
	 * the account's contact and notes. `legacy` is the free text from before
	 * venues: its notes carry no label, and a hint asks to replace it.
	 */
	let {
		place,
		directions,
		website,
		contact,
		notes,
		editHref,
		legacy,
	}: {
		place: string;
		directions: string;
		website: string;
		contact: string;
		notes: string;
		editHref: string | null;
		legacy: boolean;
	} = $props();
</script>

<div class="grid gap-2 text-14px" aria-label="Venue details" role="group">
	{#if place}<p>{place}</p>{/if}
	{#if directions || website || editHref}
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
			{#if website}
				<a
					class="link inline-flex items-center gap-1"
					href={website}
					target="_blank"
					rel="noopener"
				>
					<span class="i-ph-globe" aria-hidden="true"></span> Website
				</a>
			{/if}
			{#if editHref}
				<a class="link" href={editHref}>Edit venue</a>
			{/if}
		</p>
	{/if}
	{#if contact}<p>Contact: {contact}</p>{/if}
	{#if notes}
		<div class="grid gap-1">
			{#if !legacy}<span class="text-13px text-dim">Your notes</span>{/if}
			<p class="whitespace-pre-line text-dim">{notes}</p>
		</div>
	{/if}
	{#if legacy}
		<p class="text-12px text-dim">From before venues; pick or create a venue to replace it.</p>
	{/if}
</div>
