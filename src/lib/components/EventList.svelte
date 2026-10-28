<script lang="ts">
	import { onMount } from "svelte";
	import EventNew from "#lib/components/EventNew.svelte";
	import InfoTip from "#lib/components/InfoTip.svelte";
	import type { EventListRow } from "#lib/server/data.js";
	import { filterByTitle } from "#lib/utils/filterByTitle.js";
	import { localDay } from "#lib/utils/isoDay.js";
	import { pageTitle } from "#lib/utils/pageTitle.js";
	import { plural } from "#lib/utils/plural.js";
	import { dayText } from "#lib/utils/sessionName.js";
	import { EVENT_STATUS_LABELS, type EventKind } from "#lib/val/EventSchema.js";

	/**
	 * The Shows or the Practices page (docs/band-plan.md, "Event"): a search
	 * by title and venue, the upcoming ones soonest first and the past ones
	 * newest first, a tile each linking to the event's page, and New.
	 * "Today" is the browser's own day (read again once mounted, since the
	 * server's may differ).
	 */
	interface Props {
		kind: EventKind;
		events: EventListRow[];
		account: { id: string; slug: string; name: string };
		canEdit: boolean;
	}
	let { kind, events, account, canEdit }: Props = $props();

	const show = $derived(kind === "show");
	const noun = $derived(show ? "show" : "practice");
	const heading = $derived(show ? "Shows" : "Practices");

	let today = $state(localDay(new Date()));
	onMount(() => (today = localDay(new Date())));

	let query = $state("");
	const shown = $derived(
		filterByTitle(
			events.map((e) => ({ ...e, meta: `${e.venue} ${e.city}` })),
			query,
		),
	);
	const upcoming = $derived(shown.filter((e) => e.startsOn >= today));
	const past = $derived(shown.filter((e) => e.startsOn < today).reverse());

	const tileTitle = (e: EventListRow) => e.title.trim() || e.venue.trim() || `Untitled ${noun}`;
	function tileLine(e: EventListRow): string {
		const place = [e.venue, e.city]
			.map((s) => s.trim())
			.filter(Boolean)
			.join(", ");
		return [
			dayText(e.startsOn),
			e.startsAt,
			place,
			e.setCount ? plural(e.setCount, "set") : "",
			e.sessionCount ? plural(e.sessionCount, "session") : "",
			e.status === "planned" ? "" : EVENT_STATUS_LABELS[e.status],
		]
			.filter(Boolean)
			.join(" · ");
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
					<li class={e.status === "canceled" ? "opacity-60" : ""}>
						<a class="app-list-tile block" href="/{account.slug}/events/{e.id}">
							<span class="app-tile-heading">{tileTitle(e)}</span>
							<span class="mt-1 block text-13px text-dim">{tileLine(e)}</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
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

	{#if events.length === 0}
		<div class="max-w-article surface p-6">
			<p class="mb-2 font-700">No {noun}s yet.</p>
			<p class="text-14px text-dim">Press New {noun} to put one on the calendar.</p>
		</div>
	{:else}
		<div class="max-w-article grid gap-6">
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
	<EventNew accountId={account.id} {kind} />
{/if}
