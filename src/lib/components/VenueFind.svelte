<script lang="ts">
	import { createVenue, linkVenue, searchVenues } from "#lib/remote/venues.remote.js";
	import type { VenueChoice, VenueRow } from "#lib/server/data.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";

	/**
	 * The Find or add a venue popover. Venues are shared by every band, so it
	 * searches first (`searchVenues`, 250 ms after the last keystroke) and a
	 * result is added to the account with `linkVenue`; only "New venue"
	 * reveals the create form (`createVenue`, which reuses a venue with the
	 * same name and city). Either way `onadded` gets the account's row.
	 *
	 * No `<form>`, so it can sit inside another form (the event page's, the
	 * New show popover's) without nesting one: Enter in a field acts here
	 * instead of submitting the outer form, and the fields carry no `name`,
	 * so the outer form never posts them. It stays in its place in the DOM,
	 * so opening it from a popover keeps that one open.
	 */
	let {
		id,
		accountId,
		onadded,
	}: { id: string; accountId: string; onadded: (v: VenueRow) => void } = $props();

	let query = $state("");
	let results = $state<VenueChoice[]>([]);
	let searched = $state("");
	let creating = $state(false);
	let name = $state("");
	let address = $state("");
	let city = $state("");
	let mapUrl = $state("");
	let websiteUrl = $state("");
	let nameError = $state("");
	let busy = $state(false);

	let timer: ReturnType<typeof setTimeout> | undefined;
	/** The latest search, so an older answer arriving late is dropped. */
	let seq = 0;

	function oninput() {
		clearTimeout(timer);
		const q = query.trim();
		if (!q) {
			seq++;
			results = [];
			searched = "";
			return;
		}
		timer = setTimeout(() => void search(q), 250);
	}

	async function search(q: string) {
		const mine = ++seq;
		try {
			const found = await searchVenues({ q });
			if (mine !== seq) return;
			results = found;
			searched = q;
		} catch (err) {
			if (mine === seq) notify(`Could not search venues: ${errorMessage(err)}`, { kind: "error" });
		}
	}

	function done(row: VenueRow) {
		onadded(row);
		notify("Venue added");
		document.getElementById(id)?.hidePopover();
	}

	async function pick(v: VenueChoice) {
		if (busy) return;
		busy = true;
		try {
			done(await linkVenue({ accountId, venueId: v.id }));
		} catch (err) {
			notify(`Could not add the venue: ${errorMessage(err)}`, { kind: "error" });
		} finally {
			busy = false;
		}
	}

	function startNew() {
		creating = true;
		name = query.trim();
	}

	async function create() {
		if (busy) return;
		if (!name.trim()) {
			nameError = "Give the venue a name.";
			return;
		}
		busy = true;
		nameError = "";
		try {
			done(
				await createVenue({
					accountId,
					name: name.trim(),
					address: address.trim(),
					city: city.trim(),
					mapUrl: mapUrl.trim(),
					websiteUrl: websiteUrl.trim(),
				}),
			);
		} catch (err) {
			notify(`Could not add the venue: ${errorMessage(err)}`, { kind: "error" });
		} finally {
			busy = false;
		}
	}

	/** Enter in a field: never the outer form's submit; in the create form, Create. */
	function onkeydown(e: KeyboardEvent) {
		if (e.key !== "Enter") return;
		e.preventDefault();
		if (creating) void create();
	}
</script>

<div
	{id}
	popover="auto"
	role="dialog"
	aria-labelledby="{id}-heading"
	onbeforetoggle={(e) => {
		clearTimeout(timer);
		seq++;
		if (e.newState !== "open") return;
		query = name = address = city = mapUrl = websiteUrl = nameError = searched = "";
		results = [];
		creating = false;
	}}
	class="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-left text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
>
	<h2 class="heading-2 mb-2" id="{id}-heading">Find or add a venue</h2>
	<p class="mb-4 text-13px text-dim">
		Venues are shared by every band on Stem Shovel: find the place first, and add it only when it is
		not here yet.
	</p>
	<div class="grid gap-3">
		<label class="relative block w-full">
			<span
				class="i-ph-magnifying-glass pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-dim"
				aria-hidden="true"
			></span>
			<input
				class="field w-full py-1 pl-7 text-14px"
				type="search"
				placeholder="Name or city"
				aria-label="Search venues"
				bind:value={query}
				{oninput}
				{onkeydown}
			/>
		</label>
		{#if results.length}
			<ul class="grid gap-2" aria-label="Venues found">
				{#each results as v (v.id)}
					<li>
						<button
							class="app-list-tile block w-full text-left"
							type="button"
							disabled={busy}
							onclick={() => pick(v)}
						>
							<span class="block text-14px">{v.city ? `${v.name} · ${v.city}` : v.name}</span>
							<span class="block text-12px text-dim">Add to this account</span>
						</button>
					</li>
				{/each}
			</ul>
		{:else if searched}
			<p class="text-13px text-dim">No venue matches "{searched}".</p>
		{/if}
		{#if !creating}
			<button class="button button-sm justify-self-start" type="button" onclick={startNew}>
				<span class="i-ph-plus" aria-hidden="true"></span> New venue
			</button>
		{:else}
			<div class="grid gap-3 border-t border-white/10 pt-3" role="group" aria-label="New venue">
				<label class="grid gap-1 text-13px text-dim">
					Name
					<input
						class="field text-14px"
						type="text"
						bind:value={name}
						{onkeydown}
						placeholder="The Echo"
						maxlength="160"
					/>
				</label>
				{#if nameError}<p class="text-sm text-red-400">{nameError}</p>{/if}
				<label class="grid gap-1 text-13px text-dim">
					Address
					<input
						class="field text-14px"
						type="text"
						bind:value={address}
						{onkeydown}
						placeholder="1822 W Sunset Blvd"
						maxlength="300"
					/>
				</label>
				<label class="grid gap-1 text-13px text-dim">
					City
					<input
						class="field text-14px"
						type="text"
						bind:value={city}
						{onkeydown}
						placeholder="Los Angeles"
						maxlength="120"
					/>
				</label>
				<label class="grid gap-1 text-13px text-dim">
					Map link
					<input
						class="field text-14px"
						type="url"
						bind:value={mapUrl}
						{onkeydown}
						placeholder="https://maps.app.goo.gl/…"
						maxlength="500"
					/>
				</label>
				<label class="grid gap-1 text-13px text-dim">
					Website
					<input
						class="field text-14px"
						type="url"
						bind:value={websiteUrl}
						{onkeydown}
						placeholder="https://…"
						maxlength="500"
					/>
				</label>
				<button
					class="button button-sm button-accent justify-self-start"
					type="button"
					disabled={busy}
					onclick={create}
				>
					<span class="i-ph-plus" aria-hidden="true"></span> Create
				</button>
			</div>
		{/if}
		<button
			class="button button-sm justify-self-start"
			type="button"
			popovertarget={id}
			popovertargetaction="hide"
		>
			Cancel
		</button>
	</div>
</div>
