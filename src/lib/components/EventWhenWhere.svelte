<script lang="ts">
	import type { updateEvent } from "#lib/remote/events.remote.js";
	import {
		EVENT_KIND_LABELS,
		EVENT_KINDS,
		EVENT_STATUS_LABELS,
		EVENT_STATUSES,
		type EventFields,
		type EventKind,
	} from "#lib/val/EventSchema.js";
	import VenuePicker from "#lib/components/VenuePicker.svelte";
	import type { VenueChoice, VenueRow } from "#lib/server/data.js";
	import VenueDetails from "#lib/components/VenueDetails.svelte";
	import { venueDetailsOf } from "#lib/utils/venueDetailsOf.js";
	import type { Snippet } from "svelte";

	/** The event's fields this section reads: the form's, and the free-text place from before venues. */
	type WhenWhereFields = Pick<
		EventFields,
		"kind" | "status" | "startsOn" | "startsAt" | "endsAt" | "loadInAt" | "soundCheckAt"
	> & {
		venue?: string | null;
		address?: string | null;
		city?: string | null;
		mapUrl?: string | null;
		venueNotes?: string | null;
	};

	/**
	 * The "When and where" fields of a show or practice's form (the event
	 * page): kind, status, the day and its times (a practice has no load-in
	 * or sound check), and the venue (VenuePicker, posted as `venueId`) with
	 * its details read-only: address and city, a Directions link (the map
	 * link, else a map search of the address), the account's contact and
	 * notes, and a link to the venue's page. With no venue, the free text
	 * from before venues reads the same way, with a hint to replace it.
	 * `kind` follows the select before the form is saved.
	 */
	let {
		form,
		e,
		kind = $bindable(),
		issues,
		venue,
		venueChoices,
		accountId,
		accountSlug,
		canEdit,
	}: {
		form: ReturnType<typeof updateEvent.for>;
		e: WhenWhereFields;
		kind: EventKind;
		issues: Snippet<[{ message: string }[] | undefined]>;
		venue: VenueRow | null;
		venueChoices: VenueChoice[];
		accountId: string;
		accountSlug: string;
		canEdit: boolean;
	} = $props();

	const show = $derived(kind === "show");
	/** The chosen venue's id ('' for none), starting from the saved one. */
	let venueId = $derived(venue?.id ?? "");
	/** Venues added from the picker on this page, with their details. */
	let added = $state<Record<string, VenueRow>>({});
	/** The chosen venue's full row when this page has it (the saved one, or one just added). */
	const chosen = $derived(
		venueId ? (venue?.id === venueId ? venue : (added[venueId] ?? null)) : null,
	);
	/** What the details show: the chosen venue's, else (no venue at all) the free text from before venues. */
	const shown = $derived(venueDetailsOf(chosen, venueId, e));
</script>

<section class="grid gap-3" aria-labelledby="event-when">
	<h2 class="heading-2 mb-0" id="event-when">When and where</h2>
	<div class="grid gap-3 sm:grid-cols-3">
		<label class="grid gap-1 text-13px text-dim">
			Kind
			<select
				class="field text-14px"
				{...form.fields.kind.as("select", e.kind)}
				onchange={(ev) => (kind = ev.currentTarget.value as EventKind)}
			>
				{#each EVENT_KINDS as k (k)}
					<option value={k}>{EVENT_KIND_LABELS[k]}</option>
				{/each}
			</select>
		</label>
		<label class="grid gap-1 text-13px text-dim">
			Status
			<select class="field text-14px" {...form.fields.status.as("select", e.status)}>
				{#each EVENT_STATUSES as s (s)}
					<option value={s}>{EVENT_STATUS_LABELS[s]}</option>
				{/each}
			</select>
		</label>
		<label class="grid gap-1 text-13px text-dim">
			Day
			<input class="field text-14px" {...form.fields.startsOn.as("date", e.startsOn)} required />
		</label>
	</div>
	{@render issues(form.fields.startsOn.issues())}
	<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
		<label class="grid gap-1 text-13px text-dim">
			{show ? "Showtime" : "Starts"}
			<input class="field text-14px" {...form.fields.startsAt.as("time", e.startsAt)} />
		</label>
		<label class="grid gap-1 text-13px text-dim">
			Ends
			<input class="field text-14px" {...form.fields.endsAt.as("time", e.endsAt)} />
		</label>
		<label class={[show ? "grid" : "hidden", "gap-1 text-13px text-dim"]}>
			Load-in
			<input class="field text-14px" {...form.fields.loadInAt.as("time", e.loadInAt)} />
		</label>
		<label class={[show ? "grid" : "hidden", "gap-1 text-13px text-dim"]}>
			Sound check
			<input class="field text-14px" {...form.fields.soundCheckAt.as("time", e.soundCheckAt)} />
		</label>
	</div>
	{@render issues([
		...(form.fields.startsAt.issues() ?? []),
		...(form.fields.endsAt.issues() ?? []),
		...(form.fields.loadInAt.issues() ?? []),
		...(form.fields.soundCheckAt.issues() ?? []),
	])}
	<div class="grid gap-1 text-13px text-dim">
		<span aria-hidden="true">Venue</span>
		<VenuePicker
			choices={venueChoices}
			bind:value={venueId}
			{accountId}
			canCreate={canEdit}
			onadded={(row) => (added[row.id] = row)}
		/>
		<input {...form.fields.venueId.as("hidden", venueId)} />
	</div>
	{@render issues(form.fields.venueId.issues())}
	{#if shown}
		<VenueDetails
			{...shown}
			editHref={chosen ? `/${accountSlug}/venues/${chosen.id}` : null}
			legacy={!chosen}
		/>
	{/if}
</section>
