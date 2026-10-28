<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { onMount } from "svelte";
	import EventNew from "#lib/components/EventNew.svelte";
	import EventTile from "#lib/components/EventTile.svelte";
	import InfoTip from "#lib/components/InfoTip.svelte";
	import type { EventListRow, PracticeLocationChoice, VenueChoice } from "#lib/server/data.js";
	import { filterByTitle } from "#lib/utils/filterByTitle.js";
	import { localDay } from "#lib/utils/isoDay.js";
	import { pageTitle } from "#lib/utils/pageTitle.js";
	import type { EventKind } from "#lib/val/EventSchema.js";

	/**
	 * The Shows or the Practices page (docs/band-plan.md, "Event"): a search
	 * by title and place, a filter by place (a show's venue, `?venue=<id>`; a
	 * practice's location, `?location=<id>`; applied by the loader), the upcoming ones soonest first and the past ones newest
	 * first, a tile each (EventTile) linking to the event's page, and New.
	 * "Today" is the browser's own day (read again once mounted, since the
	 * server's may differ).
	 */
	interface Props {
		kind: EventKind;
		events: EventListRow[];
		account: { id: string; slug: string; name: string };
		canEdit: boolean;
		/** The account's venues (shows), for the filter and the New popover's picker. */
		venueChoices?: VenueChoice[];
		/** The venue the list is filtered to, '' for all. */
		venueId?: string;
		/** The account's practice locations (practices), for the filter and the New popover's picker. */
		locationChoices?: PracticeLocationChoice[];
		/** The location the list is filtered to, '' for all. */
		locationId?: string;
	}
	let {
		kind,
		events,
		account,
		canEdit,
		venueChoices = [],
		venueId = "",
		locationChoices = [],
		locationId = "",
	}: Props = $props();

	const show = $derived(kind === "show");
	const noun = $derived(show ? "show" : "practice");
	const heading = $derived(show ? "Shows" : "Practices");
	/** The place filter: a show's venue, a practice's location. */
	const filter = $derived(
		show
			? {
					param: "venue",
					value: venueId,
					label: "Filter by venue",
					all: "All venues",
					empty: "No shows at this venue.",
					options: venueChoices.map((v) => ({
						id: v.id,
						label: v.city ? `${v.name} · ${v.city}` : v.name,
					})),
				}
			: {
					param: "location",
					value: locationId,
					label: "Filter by location",
					all: "All locations",
					empty: "No practices at this location.",
					options: locationChoices.map((l) => ({ id: l.id, label: l.name })),
				},
	);

	/** What the search matches besides the title: a show's venue and city, a practice's location. */
	const placeText = (e: EventListRow) =>
		show
			? `${e.venue?.name ?? e.venueText} ${e.venue?.city ?? e.cityText}`
			: (e.location?.name ?? "");

	let today = $state(localDay(new Date()));
	onMount(() => (today = localDay(new Date())));

	let query = $state("");
	const shown = $derived(
		filterByTitle(
			events.map((e) => ({
				...e,
				meta: placeText(e),
			})),
			query,
		),
	);
	const upcoming = $derived(shown.filter((e) => e.startsOn >= today));
	const past = $derived(shown.filter((e) => e.startsOn < today).reverse());

	function filterBy(id: string) {
		const params = new URLSearchParams(page.url.search);
		if (id) params.set(filter.param, id);
		else params.delete(filter.param);
		const search = params.toString();
		void goto(`${page.url.pathname}${search ? `?${search}` : ""}`, { reset: false });
	}
</script>

{#snippet section(label: string, rows: typeof shown)}
	<section class="grid gap-3">
		<h2 class="heading-2 mb-0">{label}</h2>
		{#if rows.length === 0}
			<p class="text-14px text-dim">No {label.toLowerCase()} {noun}s.</p>
		{:else}
			<ul class="grid gap-3" aria-label="{label} {heading.toLowerCase()}">
				{#each rows as e (e.id)}
					<li><EventTile {e} accountSlug={account.slug} /></li>
				{/each}
			</ul>
		{/if}
	</section>
{/snippet}

{#snippet header()}
	<header class="max-w-article mb-6">
		<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
			<h1 class="app-page-heading mb-0 flex items-center gap-2">
				{heading}
				<InfoTip
					text={show
						? "A show is a night on the calendar: when and where, the sets you play (set lists in order) and the sessions that taped it."
						: "A practice is a rehearsal on the calendar: when and where, what you run through (set lists in order) and the sessions that taped it."}
					label="About {heading.toLowerCase()}"
					class="text-16px"
				/>
			</h1>
			{#if canEdit}
				<button
					class="button button-sm button-accent ml-auto"
					type="button"
					popovertarget="new-event"
				>
					<span class="i-ph-plus" aria-hidden="true"></span> New {noun}
				</button>
			{/if}
		</div>
		<p class="mt-3 text-15px opacity-85">
			{#if show}
				The band's nights out: the day and the times, the venue and how to get there, the sets and
				the tapes. Every member sees them.
			{:else}
				The band's rehearsals: when and where, what you run through and the tapes. Every member sees
				them.
			{/if}
		</p>
	</header>
{/snippet}

{#snippet placeFilter()}
	{#if filter.options.length || filter.value}
		<select
			class="field w-full py-1 text-13px sm-w-56"
			aria-label={filter.label}
			value={filter.value}
			onchange={(ev) => filterBy(ev.currentTarget.value)}
		>
			<option value="">{filter.all}</option>
			{#each filter.options as o (o.id)}
				<option value={o.id}>{o.label}</option>
			{/each}
		</select>
	{/if}
{/snippet}

<svelte:head>
	<title>{pageTitle(`${heading} · ${account.name}`)}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="page">
	{@render header()}

	{#if events.length === 0 && filter.value}
		<div class="max-w-article grid gap-4">
			{@render placeFilter()}
			<p class="text-14px text-dim">{filter.empty}</p>
		</div>
	{:else if events.length === 0}
		<div class="max-w-article surface p-6">
			<p class="mb-2 font-700">No {noun}s yet.</p>
			<p class="text-14px text-dim">Press New {noun} to put one on the calendar.</p>
		</div>
	{:else}
		<div class="max-w-article grid gap-6">
			<div class="flex flex-wrap items-center gap-3">
				<label class="relative block w-full sm-w-72">
					<span class="sr-only">Search {heading.toLowerCase()}</span>
					<span
						class="i-ph-magnifying-glass pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-dim"
						aria-hidden="true"
					></span>
					<input
						class="field w-full py-1 pl-7 text-13px"
						type="search"
						placeholder="Search by title or {show ? 'venue' : 'location'}"
						aria-label="Search {heading.toLowerCase()}"
						bind:value={query}
					/>
				</label>
				{@render placeFilter()}
			</div>
			{#if shown.length === 0}
				<p class="text-14px text-dim">No {noun} matches "{query.trim()}".</p>
			{:else}
				{@render section("Upcoming", upcoming)}
				{#if past.length}{@render section("Past", past)}{/if}
			{/if}
		</div>
	{/if}
</main>

{#if canEdit}
	<EventNew accountId={account.id} {kind} {venueChoices} {locationChoices} />
{/if}
