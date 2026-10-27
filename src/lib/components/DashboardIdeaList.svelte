<script lang="ts">
	import { DASHBOARD_IDEAS_PAGE, type DashboardEntry } from "#lib/constants/dashboardLinks.js";
	import { formatDate } from "#lib/utils/formatDate.js";
	import { pageOf } from "#lib/utils/pageOf.js";

	/** A dashboard section's ideas after the search: the first `shown`, then how many of how many with a Show more button while some remain. */
	interface Props {
		heading: string;
		ideas: DashboardEntry[];
		shown: number;
		/** The list holds only the newest the server sends, so the count reads "of the latest N". */
		capped?: boolean;
		onmore: () => void;
		/** The person's last dashboard visit: an entry newer than it carries a dot. */
		since?: Date | null;
		/** The pins the person has, as `kind:id`, with the toggle's handler; rows with a `pin` get a pin button. */
		pins?: Set<string>;
		onpin?: (idea: DashboardEntry, pinned: boolean) => void;
	}
	let {
		heading,
		ideas,
		shown,
		capped = false,
		onmore,
		since = null,
		pins,
		onpin,
	}: Props = $props();

	let page = $derived(pageOf(ideas, shown));
	const isNew = (idea: DashboardEntry) => since !== null && idea.when.getTime() > since.getTime();
	const isPinned = (idea: DashboardEntry) =>
		!!idea.pin && !!pins && pins.has(`${idea.pin.kind}:${idea.pin.id}`);
</script>

{#if ideas.length === 0}
	<p class="text-14px opacity-80">Nothing matches.</p>
{:else}
	<ul class="surface divide-y divide-white/10 text-15px" aria-label={heading}>
		{#each page.visible as idea (idea.id)}
			<li class="flex flex-wrap items-baseline justify-between gap-x-4 px-5 py-2">
				<div class="min-w-0">
					{#if isNew(idea)}
						<span
							class="mr-1.5 inline-block size-2 rounded-full bg-accent align-middle"
							role="img"
							aria-label="New since your last visit"
							title="New since your last visit"
						></span>
					{/if}
					<a class="link" href={idea.href}>{idea.title || "Untitled"}</a>
					{#if idea.meta}
						<div class="text-12px opacity-70">{idea.meta}</div>
					{/if}
				</div>
				<span class="flex items-center gap-2 text-12px opacity-60">
					{idea.whenText ?? formatDate(idea.when)}
					{#if idea.pin && onpin}
						{@const pinned = isPinned(idea)}
						<button
							type="button"
							class="button button-xs px-1.5 {pinned ? 'text-accent' : ''}"
							aria-pressed={pinned}
							aria-label="{pinned ? 'Unpin' : 'Pin'} {idea.title || 'Untitled'}"
							title={pinned ? "Unpin from your dashboard" : "Pin to your dashboard"}
							onclick={() => onpin(idea, !pinned)}
						>
							<span class={pinned ? "i-ph-push-pin-fill" : "i-ph-push-pin"} aria-hidden="true"
							></span>
						</button>
					{/if}
				</span>
			</li>
		{/each}
	</ul>
	{#if page.total > DASHBOARD_IDEAS_PAGE}
		<div class="flex flex-wrap items-center gap-3">
			<p class="text-12px opacity-70">
				Showing {page.count} of {capped ? `the latest ${page.total}` : page.total}
			</p>
			{#if page.more}
				<button type="button" class="button button-xs" onclick={onmore}>Show more</button>
			{/if}
		</div>
	{/if}
{/if}
