<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { onMount } from "svelte";
	import EventNew from "#lib/components/EventNew.svelte";
	import EventTile from "#lib/components/EventTile.svelte";
	import InfoTip from "#lib/components/InfoTip.svelte";
	import type { EventListRow, VenueChoice } from "#lib/server/data.js";
	import { filterByTitle } from "#lib/utils/filterByTitle.js";
	import { localDay } from "#lib/utils/isoDay.js";
	import { pageTitle } from "#lib/utils/pageTitle.js";
	import type { EventKind } from "#lib/val/EventSchema.js";

	/**
	 * The Shows or the Practices page (docs/band-plan.md, "Event"): a search
	 * by title and venue, a venue filter (`?venue=<id>`, applied by the
	 * loader), the upcoming ones soonest first and the past ones newest
	 * first, a tile each (EventTile) linking to the event's page, and New.
	 * "Today" is the browser's own day (read again once mounted, since the
	 * server's may differ).
	 */
	interface Props {
		kind: EventKind;
		events: EventListRow[];
		account: { id: string; slug: string; name: string };
		canEdit: boolean;
		/** The account's venues, for the filter and the New popover's picker. */
		venueChoices: VenueChoice[];
		/** The venue the list is filtered to, '' for all. */
		venueId: string;
	}
	let { kind, events, account, canEdit, venueChoices, venueId }: Props = $props();

	const show = $derived(kind === "show");
	const noun = $derived(show ? "show" : "practice");
	const heading = $derived(show ? "Shows" : "Practices");

	let today = $state(localDay(new Date()));
	onMount(() => (today = localDay(new Date())));

	let query = $state("");
	const shown = $derived(
		filterByTitle(
			events.map((e) => ({
				...e,
				meta: `${e.venue?.name ?? e.venueText} ${e.venue?.city ?? e.cityText}`,
			})),
			query,
		),
	);
	const upcoming = $derived(shown.filter((e) => e.startsOn >= today));
	const past = $derived(shown.filter((e) => e.startsOn < today).reverse());

	function filterVenue(id: string) {
		const params = new URLSearchParams(page.url.search);
		if (id) params.set("venue", id);
		else params.delete("venue");
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

{#snippet venueFilter()}
	{#if venueChoices.length || venueId}
		<select
			class="field w-full py-1 text-13px sm-w-56"
			aria-label="Filter by venue"
			value={venueId}
			onchange={(ev) => filterVenue(ev.currentTarget.value)}
		>
			<option value="">All venues</option>
			{#each venueChoices as v (v.id)}
				<option value={v.id}>{v.city ? `${v.name} · ${v.city}` : v.name}</option>
			{/each}
		</select>
	{/if}
{/snippet}

<svelte:head>
	<title>{pageTitle(`${heading} · ${account.name}`)}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="page">
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

	{#if events.length === 0 && venueId}
		<div class="max-w-article grid gap-4">
			{@render venueFilter()}
			<p class="text-14px text-dim">No {noun}s at this venue.</p>
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
						placeholder="Search by title or venue"
						aria-label="Search {heading.toLowerCase()}"
						bind:value={query}
					/>
				</label>
				{@render venueFilter()}
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
	<EventNew accountId={account.id} {kind} {venueChoices} />
{/if}
