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
	import type { Snippet } from "svelte";

	/**
	 * The "When and where" fields of a show or practice's form (the event
	 * page): kind, status, the day and its times (a practice has no load-in
	 * or sound check), the venue and its address with a Directions link (the
	 * map link, else a map search of the address), and the venue notes.
	 * `kind` follows the select before the form is saved.
	 */
	let {
		form,
		e,
		kind = $bindable(),
		issues,
	}: {
		form: ReturnType<typeof updateEvent.for>;
		e: EventFields;
		kind: EventKind;
		issues: Snippet<[{ message: string }[] | undefined]>;
	} = $props();

	const show = $derived(kind === "show");
	const place = $derived([e.venue, e.address, e.city].map((s) => s.trim()).filter(Boolean));
	const directions = $derived(
		e.mapUrl ||
			(place.length
				? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.join(", "))}`
				: ""),
	);
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
	<label class="grid gap-1 text-13px text-dim">
		Venue
		<input
			class="field text-14px"
			{...form.fields.venue.as("text", e.venue)}
			placeholder={show ? "The Echo" : "The practice space"}
			maxlength="160"
		/>
	</label>
	{@render issues(form.fields.venue.issues())}
	<div class="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
		<label class="grid gap-1 text-13px text-dim">
			Address
			<input
				class="field text-14px"
				{...form.fields.address.as("text", e.address)}
				placeholder="1822 W Sunset Blvd"
				maxlength="300"
			/>
		</label>
		<label class="grid gap-1 text-13px text-dim">
			City
			<input
				class="field text-14px"
				{...form.fields.city.as("text", e.city)}
				placeholder="Los Angeles"
				maxlength="120"
			/>
		</label>
	</div>
	{@render issues([...(form.fields.address.issues() ?? []), ...(form.fields.city.issues() ?? [])])}
	{#if directions}
		<p class="text-14px">
			<a
				class="link inline-flex items-center gap-1"
				href={directions}
				target="_blank"
				rel="noopener"
			>
				<span class="i-ph-map-pin" aria-hidden="true"></span> Directions
			</a>
		</p>
	{/if}
	<label class="grid gap-1 text-13px text-dim">
		Map link
		<input
			class="field text-14px"
			{...form.fields.mapUrl.as("url", e.mapUrl)}
			placeholder="https://maps.app.goo.gl/…"
			maxlength="500"
		/>
		<span class="text-12px">Leave it blank and the address is looked up on a map.</span>
	</label>
	{@render issues(form.fields.mapUrl.issues())}
	<label class="grid gap-1 text-13px text-dim">
		Venue notes
		<textarea
			class="field min-h-16 text-14px"
			placeholder="Parking, the back door, the house engineer's name"
			maxlength="2000"
			{...form.fields.venueNotes.as("text", e.venueNotes)}></textarea>
	</label>
	{@render issues(form.fields.venueNotes.issues())}
</section>
