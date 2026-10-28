<script lang="ts">
	import { goto } from "$app/navigation";
	import EventTile from "#lib/components/EventTile.svelte";
	import VenueAboutForm from "#lib/components/VenueAboutForm.svelte";
	import VenueLocalForm from "#lib/components/VenueLocalForm.svelte";
	import { unlinkVenue } from "#lib/remote/venues.remote.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { directionsUrl } from "#lib/utils/directionsUrl.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import { pageTitle } from "#lib/utils/pageTitle.js";
	import { plural } from "#lib/utils/plural.js";

	/**
	 * A venue the account has linked: its shared facts (About the venue,
	 * every band's), the account's own notes and contact, the shows and
	 * practices there, and Remove from this account while none are on the
	 * calendar (the venue itself stays on Stem Shovel).
	 */
	let { data } = $props();

	const v = $derived(data.venue);
	const listHref = $derived(`/${data.account.slug}/venues`);
	const place = $derived(
		[v.address, v.city]
			.map((s) => s.trim())
			.filter(Boolean)
			.join(", "),
	);
	const directions = $derived(directionsUrl(v));
	let busy = $state(false);

	async function remove() {
		if (!confirm("Remove this venue from your list? The place stays on Stem Shovel.")) return;
		busy = true;
		try {
			await unlinkVenue({ accountId: data.account.id, venueId: v.id });
			notify("Venue removed");
			await goto(listHref);
		} catch (err) {
			notify(`Could not remove the venue: ${errorMessage(err)}`, { kind: "error" });
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>{pageTitle(`${v.name} · Venues · ${data.account.name}`)}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="page">
	<div class="max-w-article grid gap-6">
		<header class="grid gap-2">
			<p class="text-sm"><a class="link" href={listHref}>← Venues</a></p>
			<h1 class="app-page-heading mb-0">{v.name}</h1>
			{#if place}<p class="text-15px opacity-85">{place}</p>{/if}
			{#if directions || v.websiteUrl}
				<p class="flex flex-wrap items-center gap-x-4 gap-y-1 text-14px">
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
					{#if v.websiteUrl}
						<a
							class="link inline-flex items-center gap-1"
							href={v.websiteUrl}
							target="_blank"
							rel="noopener"
						>
							<span class="i-ph-globe" aria-hidden="true"></span> Website
						</a>
					{/if}
				</p>
			{/if}
		</header>

		<section class="grid gap-3" aria-labelledby="venue-about">
			<h2 class="heading-2 mb-0" id="venue-about">About the venue</h2>
			<p class="text-13px text-dim">
				Shared with every band on Stem Shovel; keep it to facts about the place.
			</p>
			<VenueAboutForm venue={v} canEdit={data.canEdit} />
		</section>

		<section class="grid gap-3" aria-labelledby="venue-notes">
			<h2 class="heading-2 mb-0" id="venue-notes">Your notes and contact</h2>
			<p class="text-13px text-dim">Only your band sees these.</p>
			<VenueLocalForm venue={v} accountId={data.account.id} canEdit={data.canEdit} />
		</section>

		<section class="grid gap-3" aria-labelledby="venue-events">
			<div class="flex flex-wrap items-center gap-x-4 gap-y-1">
				<h2 class="heading-2 mb-0" id="venue-events">Shows and practices here</h2>
				<a class="link text-14px" href="/{data.account.slug}/shows?venue={v.id}">All shows here</a>
			</div>
			{#if data.events.length === 0}
				<p class="text-14px text-dim">None yet.</p>
			{:else}
				<ul class="grid gap-3" aria-label="Shows and practices here">
					{#each data.events as e (e.id)}
						<li><EventTile {e} accountSlug={data.account.slug} /></li>
					{/each}
				</ul>
			{/if}
		</section>

		{#if data.canEdit}
			{#if v.eventCount > 0}
				<p class="text-13px text-dim">
					In use by {plural(v.eventCount, "show or practice", "shows or practices")} here; it cannot be
					removed.
				</p>
			{:else}
				<button
					class="button button-sm justify-self-start"
					type="button"
					disabled={busy}
					onclick={remove}
				>
					<span class="i-ph-x" aria-hidden="true"></span> Remove from this account
				</button>
			{/if}
		{/if}
	</div>
</main>
