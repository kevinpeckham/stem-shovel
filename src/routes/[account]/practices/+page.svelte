<script lang="ts">
	import EventList from "#lib/components/EventList.svelte";

	/** The account's practices (docs/band-plan.md, "Event"): EventList does the page. */
	let { data } = $props();
</script>

<EventList
	kind="practice"
	events={data.events}
	account={data.account}
	canEdit={data.canEdit}
	locationChoices={data.locationChoices}
	locationId={data.locationId}
/>
