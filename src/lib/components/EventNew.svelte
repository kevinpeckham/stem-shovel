<script lang="ts">
	import VenuePicker from "#lib/components/VenuePicker.svelte";
	import { createEvent } from "#lib/remote/events.remote.js";
	import type { VenueChoice } from "#lib/server/data.js";
	import { clearForm } from "#lib/utils/clearForm.js";
	import { localDay } from "#lib/utils/isoDay.js";
	import type { EventKind } from "#lib/val/EventSchema.js";

	/** The New show / New practice popover (`#new-event`): a day, a title and a venue (VenuePicker), then the event's page (the form redirects there). */
	let {
		accountId,
		kind,
		venueChoices,
	}: { accountId: string; kind: EventKind; venueChoices: VenueChoice[] } = $props();

	const show = $derived(kind === "show");
	/** The default day: today where the browser is, read again each time the popover opens. */
	let today = $state(localDay(new Date()));
	/** The venue picked, '' for none; cleared each time the popover opens. */
	let venueId = $state("");
</script>

<div
	id="new-event"
	popover="auto"
	onbeforetoggle={(e) => {
		if (e.newState !== "open") return;
		today = localDay(new Date());
		venueId = "";
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
		{#each createEvent.fields.startsOn.issues() ?? [] as issue (issue.message)}
			<p class="text-sm text-red-400">{issue.message}</p>
		{/each}
		<label class="grid gap-1 text-13px text-dim">
			Title
			<input
				class="field text-15px"
				{...createEvent.fields.title.as("text")}
				placeholder={show ? "with The Night Shift" : "Full run-through"}
				maxlength="160"
			/>
		</label>
		{#each createEvent.fields.title.issues() ?? [] as issue (issue.message)}
			<p class="text-sm text-red-400">{issue.message}</p>
		{/each}
		<div class="grid gap-1 text-13px text-dim">
			<span aria-hidden="true">Venue</span>
			<VenuePicker choices={venueChoices} bind:value={venueId} {accountId} canCreate />
			<input {...createEvent.fields.venueId.as("hidden", venueId)} />
		</div>
		{#each createEvent.fields.venueId.issues() ?? [] as issue (issue.message)}
			<p class="text-sm text-red-400">{issue.message}</p>
		{/each}
		<button
			class="button button-sm button-accent justify-self-start"
			disabled={!!createEvent.pending}
		>
			<span class="i-ph-plus" aria-hidden="true"></span> Create
		</button>
	</form>
</div>
