<script lang="ts">
	import type { UpcomingEvent } from "#lib/server/calendar.js";
	import { calendarFeedUrl } from "#lib/remote/calendar.remote.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { countdownText } from "#lib/utils/countdownText.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import { dayText } from "#lib/utils/sessionName.js";

	/**
	 * The dashboard's "Upcoming" (docs/band-plan.md, "Dashboard"): the next
	 * shows and practices across the person's accounts, soonest first, each
	 * a link to its page under its poster (or its kind's icon), with how far
	 * off it is, the day, the time and the place (and the account, with
	 * several). With one account, links to its Shows page and copies its
	 * calendar feed's address; `feed` is false where the feed is not the
	 * viewer's to ask for (a super admin viewing someone's dashboard).
	 * Rendered only with something in it.
	 */
	interface Props {
		events: UpcomingEvent[];
		accounts: { accountId: string; slug: string; name: string }[];
		/** `YYYY-MM-DD`, the loader's: what the countdowns count from. */
		today: string;
		feed?: boolean;
	}
	let { events, accounts, today, feed = true }: Props = $props();

	let several = $derived(accounts.length > 1);
	let only = $derived(accounts.length === 1 ? accounts[0] : null);

	const KIND = {
		show: { icon: "i-ph-ticket", noun: "Show" },
		practice: { icon: "i-ph-calendar-dots", noun: "Practice" },
	} as const;

	const line = (e: UpcomingEvent) =>
		[countdownText(e.startsOn, today), dayText(e.startsOn), e.startsAt, e.place]
			.filter(Boolean)
			.join(" · ");

	let copying = $state(false);
	async function copyFeed(accountId: string) {
		copying = true;
		try {
			const { url } = await calendarFeedUrl({ accountId });
			await navigator.clipboard.writeText(location.origin + url);
			notify("Calendar link copied: subscribe to it in your calendar app");
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		} finally {
			copying = false;
		}
	}
</script>

{#snippet row(e: UpcomingEvent)}
	<li class="min-w-0">
		<a class="group flex items-start gap-3" href="/{e.accountSlug}/events/{e.id}">
			{#if e.posterThumbnailUrl}
				<img
					class="h-10 w-7 shrink-0 rounded object-cover"
					src={e.posterThumbnailUrl}
					alt=""
					loading="lazy"
				/>
			{:else}
				<span class="{KIND[e.kind].icon} mt-0.5 shrink-0 text-20px opacity-70" aria-hidden="true"
				></span>
			{/if}
			<span class="grid min-w-0">
				<span class="link truncate">{e.title.trim() || e.place || KIND[e.kind].noun}</span>
				<span class="text-12px opacity-70">{line(e)}</span>
				{#if several}
					<span class="text-12px opacity-70">{e.accountName}</span>
				{/if}
			</span>
		</a>
	</li>
{/snippet}

{#if events.length > 0}
	<section class="surface grid gap-3 p-5" aria-labelledby="dashboard-upcoming">
		<h2 class="marketing-section-heading mb-0" id="dashboard-upcoming">Upcoming</h2>
		<ul class="grid gap-3 text-15px" aria-label="Upcoming shows and practices">
			{#each events as e (e.id)}
				{@render row(e)}
			{/each}
		</ul>
		{#if only}
			<div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-14px">
				<a class="link" href="/{only.slug}/shows">All shows</a>
				{#if feed}
					<button
						type="button"
						class="link inline-flex items-center gap-1"
						disabled={copying}
						onclick={() => copyFeed(only.accountId)}
					>
						<span class="i-ph-calendar-plus" aria-hidden="true"></span>
						Calendar feed
					</button>
				{/if}
			</div>
		{/if}
	</section>
{/if}
