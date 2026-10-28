<script lang="ts">
	import FieldIssues from "#lib/components/FieldIssues.svelte";
	import LocationPicker from "#lib/components/LocationPicker.svelte";
	import VenuePicker from "#lib/components/VenuePicker.svelte";
	import { createEvent } from "#lib/remote/events.remote.js";
	import type { PracticeLocationChoice, VenueChoice } from "#lib/server/data.js";
	import { clearForm } from "#lib/utils/clearForm.js";
	import { localDay } from "#lib/utils/isoDay.js";
	import type { EventKind } from "#lib/val/EventSchema.js";

	/**
	 * The New show / New practice popover (`#new-event`): a day, a title and
	 * where (a show's venue, VenuePicker; a practice's location,
	 * LocationPicker), then the event's page (the form redirects there).
	 */
	let {
		accountId,
		kind,
		venueChoices = [],
		locationChoices = [],
	}: {
		accountId: string;
		kind: EventKind;
		venueChoices?: VenueChoice[];
		locationChoices?: PracticeLocationChoice[];
	} = $props();

	const show = $derived(kind === "show");
	/** The default day: today where the browser is, read again each time the popover opens. */
	let today = $state(localDay(new Date()));
	/** The venue picked, '' for none; cleared each time the popover opens. */
	let venueId = $state("");
	/** The practice location picked, '' for none; cleared each time the popover opens. */
	let locationId = $state("");
</script>

<div
	id="new-event"
	popover="auto"
	onbeforetoggle={(e) => {
		if (e.newState !== "open") return;
		today = localDay(new Date());
		venueId = locationId = "";
		clearForm(createEvent);
	}}
	class="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
>
	<div class="mb-4 flex items-center justify-between gap-4">
		<h2 class="heading-2 mb-0">{show ? "New show" : "New practice"}</h2>
		<button
			class="button button-xs"
			type="button"
			popovertarget="new-event"
			popovertargetaction="hide"
		>
			Close
		</button>
	</div>
	<form class="grid gap-3" {...createEvent}>
		<input {...createEvent.fields.accountId.as("hidden", accountId)} />
		<input {...createEvent.fields.kind.as("hidden", kind)} />
		<label class="grid gap-1 text-13px text-dim">
			Day
			<input class="field text-15px" {...createEvent.fields.startsOn.as("date", today)} required />
		</label>
		<FieldIssues issues={createEvent.fields.startsOn.issues()} />
		<label class="grid gap-1 text-13px text-dim">
			Title
			<input
				class="field text-15px"
				{...createEvent.fields.title.as("text")}
				placeholder={show ? "with The Night Shift" : "Full run-through"}
				maxlength="160"
			/>
		</label>
		<FieldIssues issues={createEvent.fields.title.issues()} />
		{#if show}
			<div class="grid gap-1 text-13px text-dim">
				<span aria-hidden="true">Venue</span>
				<VenuePicker choices={venueChoices} bind:value={venueId} {accountId} canCreate />
				<input {...createEvent.fields.venueId.as("hidden", venueId)} />
			</div>
			<FieldIssues issues={createEvent.fields.venueId.issues()} />
		{:else}
			<div class="grid gap-1 text-13px text-dim">
				<span aria-hidden="true">Location</span>
				<LocationPicker choices={locationChoices} bind:value={locationId} {accountId} canCreate />
				<input {...createEvent.fields.locationId.as("hidden", locationId)} />
			</div>
			<FieldIssues issues={createEvent.fields.locationId.issues()} />
		{/if}
		<button
			class="button button-sm button-accent justify-self-start"
			disabled={!!createEvent.pending}
		>
			<span class="i-ph-plus" aria-hidden="true"></span> Create
		</button>
	</form>
</div>
