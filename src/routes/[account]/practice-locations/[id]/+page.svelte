<script lang="ts">
	import { goto } from "$app/navigation";
	import EventTile from "#lib/components/EventTile.svelte";
	import LocationForm from "#lib/components/LocationForm.svelte";
	import { deletePracticeLocation } from "#lib/remote/practiceLocations.remote.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import { pageTitle } from "#lib/utils/pageTitle.js";
	import { plural } from "#lib/utils/plural.js";

	/**
	 * A practice location of the account: its name, address and notes (a
	 * form, read-only unless the viewer may edit), the practices there, and
	 * Delete while none are on the calendar.
	 */
	let { data } = $props();

	const l = $derived(data.location);
	const listHref = $derived(`/${data.account.slug}/practice-locations`);
	let busy = $state(false);

	async function remove() {
		if (!confirm("Delete this location?")) return;
		busy = true;
		try {
			await deletePracticeLocation({ id: l.id });
			notify("Location deleted");
			await goto(listHref);
		} catch (err) {
			notify(`Could not delete the location: ${errorMessage(err)}`, { kind: "error" });
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>{pageTitle(`${l.name} · Practice locations · ${data.account.name}`)}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="page">
	<div class="max-w-article grid gap-6">
		<header class="grid gap-2">
			<p class="text-sm"><a class="link" href={listHref}>← Practice locations</a></p>
			<h1 class="app-page-heading mb-0">{l.name}</h1>
		</header>

		<LocationForm location={l} canEdit={data.canEdit} />

		<section class="grid gap-3" aria-labelledby="location-events">
			<div class="flex flex-wrap items-center gap-x-4 gap-y-1">
				<h2 class="heading-2 mb-0" id="location-events">Practices here</h2>
				<a class="link text-14px" href="/{data.account.slug}/practices?location={l.id}"
					>All practices here</a
				>
			</div>
			{#if data.events.length === 0}
				<p class="text-14px text-dim">None yet.</p>
			{:else}
				<ul class="grid gap-3" aria-label="Practices here">
					{#each data.events as e (e.id)}
						<li><EventTile {e} accountSlug={data.account.slug} /></li>
					{/each}
				</ul>
			{/if}
		</section>

		{#if data.canEdit}
			{#if l.eventCount > 0}
				<p class="text-13px text-dim">
					In use by {plural(l.eventCount, "practice")}; it cannot be deleted.
				</p>
			{:else}
				<button
					class="button button-sm justify-self-start"
					type="button"
					disabled={busy}
					onclick={remove}
				>
					<span class="i-ph-trash" aria-hidden="true"></span> Delete
				</button>
			{/if}
		{/if}
	</div>
</main>
