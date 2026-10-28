<script lang="ts">
	import type { EventListRow } from "#lib/server/data.js";
	import { plural } from "#lib/utils/plural.js";
	import { dayText } from "#lib/utils/sessionName.js";
	import { EVENT_STATUS_LABELS } from "#lib/val/EventSchema.js";

	/**
	 * A show or practice as a list tile (the Shows and Practices pages, a
	 * venue's page): the poster's thumbnail, the title (else the venue), and
	 * a line with the day, the time, the place, the sets and sessions and a
	 * status other than planned. A canceled one is dimmed. Render it in an
	 * `<li>`.
	 */
	let { e, accountSlug }: { e: EventListRow; accountSlug: string } = $props();

	/** The poster on the tile: its thumbnail, else the poster itself when it is an image (a PDF without a thumbnail shows none). */
	const thumb = $derived(
		e.posterThumbnailUrl ??
			(e.posterUrl &&
			/\.(png|jpe?g|webp|gif|avif)$/i.test(new URL(e.posterUrl, "http://x").pathname)
				? e.posterUrl
				: null),
	);
	const venueName = $derived((e.venue?.name ?? e.venueText ?? "").trim());
	const title = $derived(
		e.title.trim() || venueName || `Untitled ${e.kind === "show" ? "show" : "practice"}`,
	);
	const line = $derived(
		[
			dayText(e.startsOn),
			e.startsAt,
			[venueName, (e.venue?.city ?? e.cityText ?? "").trim()].filter(Boolean).join(", "),
			e.setCount ? plural(e.setCount, "set") : "",
			e.sessionCount ? plural(e.sessionCount, "session") : "",
			e.status === "planned" ? "" : EVENT_STATUS_LABELS[e.status],
		]
			.filter(Boolean)
			.join(" · "),
	);
</script>

<a
	class="app-list-tile {thumb ? 'flex items-center gap-3' : 'block'} {e.status === 'canceled'
		? 'opacity-60'
		: ''}"
	href="/{accountSlug}/events/{e.id}"
>
	{#if thumb}
		<img class="h-14 w-10 shrink-0 rounded object-cover" src={thumb} alt="" loading="lazy" />
	{/if}
	<span class="block min-w-0">
		<span class="app-tile-heading">{title}</span>
		<span class="mt-1 block text-13px text-dim">{line}</span>
	</span>
</a>
